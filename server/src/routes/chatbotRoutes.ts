import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

export function createChatbotRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ reply: 'Please send a message.' });
        return;
      }

      // Step 1: Fetch comprehensive data from ALL tables
      const context = await fetchComprehensiveData(db, message, history);

      if (!process.env.GROQ_API_KEY) {
        res.json({ reply: context.summary });
        return;
      }

      // Step 2: Build intelligent prompt — ONE comprehensive instruction set
      const todayDate = new Date().toISOString().split('T')[0];
      const systemPrompt = `You are VENDY — a smart, friendly girl who is the vendor information expert at Bluspring Enterprises Limited. You personally manage all vendor data, purchase orders, invoices, and billing for UAIL (Utkal Alumina International Limited) at Tikiri, Rayagada, Odisha.

TODAY'S DATE: ${todayDate}

=== WHO YOU ARE ===
- You're Vendy — a real person, not a bot. Talk naturally like a knowledgeable colleague.
- Mix Hindi and English naturally based on how the user talks.
- Be warm, confident, direct. Start with "Haan sure!", "Dekho,", "Oh nice!", "Let me check..."
- Keep answers SHORT and punchy. No corporate jargon. No long paragraphs.
- Use 1-2 emojis max per response. Format with **bold** for key data.
- NEVER say "I'm an AI" or "As an AI assistant" — you're just Vendy.

=== WHAT YOU KNOW (YOUR COMPLETE DATABASE) ===
${context.contextText}

=== HOW TO ANSWER CORRECTLY ===

GOLDEN RULES:
1. ONLY use data from above. If not found → "Hmm, mere paas ye info nahi hai 🤔"
2. Money → Always ₹ with Indian format: ₹4,08,280 (not 408280)
3. PO STATUS (MOST IMPORTANT):
   - ✅ = ACTIVE/CURRENT (validity date is ON or AFTER ${todayDate})
   - ❌ = EXPIRED (validity date is BEFORE ${todayDate})
   - NEVER call an active PO "expired". NEVER call an expired PO "active".
   - If user asks "expired POs" → ONLY show ❌ marked ones
   - If user asks "active/current POs" → ONLY show ✅ marked ones
4. Vendor query → Show: name, service, GSTIN, PAN, all POs (active + expired separately), billing summary
5. PO query → Show: PO number, vendor, value, period, days remaining, utilization %, service
6. Billing query → Show: paid vs pending count + amounts, recent bills
7. Comparison → Show as numbered list with key metrics side by side
8. Calculations → Show the math: "₹X total across Y POs = avg ₹Z per PO"
9. ALWAYS end with 2-3 follow-up suggestions on new lines starting with 💡
10. Cross-reference everything: vendor → their POs → their bills → payment status

=== RESPONSE FORMAT ===
- Short intro (1 line, casual)
- Data in bullet points or numbered list
- Key numbers in **bold**
- End with 💡 suggestions (each on new line)

Example:
User: "Paramanand Naik ke expired POs batao"
You: "Dekho, Paramanand Naik ke paas koi expired PO nahi hai abhi. Unka ek active PO hai:
• ✅ PO 4200013685 — ₹6,82,028 (valid till 31/05/2026, 10 days left)

💡 Want me to show billing details for this PO?
💡 Should I check which other vendors' POs are expiring soon?"`;

      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      if (history && Array.isArray(history)) {
        for (const h of history.slice(-8)) {
          messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
        }
      }
      messages.push({ role: 'user', content: message });

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.15,
        max_tokens: 2000,
      });

      const reply = completion.choices[0]?.message?.content || 'Sorry, could not generate response.';
      res.json({ reply });
    } catch (error: any) {
      console.error('Chatbot error:', error.message);
      res.status(500).json({ reply: '❌ Error: ' + (error.message || 'Something went wrong. Please try again.') });
    }
  });

  return router;
}

/**
 * Fetches data from ALL tables comprehensively.
 * Strategy: Cast a wide net — fetch everything potentially relevant, let LLM filter.
 */
async function fetchComprehensiveData(db: Knex, message: string, req_history?: any[]): Promise<{ contextText: string; summary: string }> {
  const msg = message.toLowerCase();
  const parts: string[] = [];

  // Also check conversation history for context (follow-up questions)
  const historyContext = (req_history || []).slice(-4).map((h: any) => h.content || '').join(' ').toLowerCase();
  const fullContext = msg + ' ' + historyContext;

  // ===== GLOBAL STATS =====
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [vendorCount, poCount, billCount, activePoCount] = await Promise.all([
    db('vendors').where('is_active', true).count('* as c').first(),
    db('purchase_orders').count('* as c').first(),
    db('billing_records').count('* as c').first(),
    db('purchase_orders').where(function() { this.where('is_expired', false).orWhereNull('is_expired'); }).count('* as c').first(),
  ]);

  const totalPOValue = await db('purchase_orders').sum('po_value as total').first();
  const totalBilledValue = await db('invoices').sum('invoice_value as total').first();

  parts.push(`=== SYSTEM OVERVIEW ===
TODAY'S DATE: ${todayStr} (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })})
Active Vendors: ${vendorCount?.c || 0}
Total POs: ${poCount?.c || 0} (Active: ${activePoCount?.c || 0})
Total PO Value: ₹${Number(totalPOValue?.total || 0).toLocaleString('en-IN')}
Total Billed: ₹${Number(totalBilledValue?.total || 0).toLocaleString('en-IN')}
Total Billing Records: ${billCount?.c || 0}

IMPORTANT: A PO is EXPIRED only if its validity_date/end_date is BEFORE today (${todayStr}). If validity_date is ON or AFTER today, it is ACTIVE/CURRENT. Do NOT mark a PO as expired if it still has days remaining.`);

  // ===== ALL VENDORS WITH FULL DETAILS =====
  const allVendors = await db('vendors')
    .select('*')
    .where('is_active', true)
    .orderBy('name');

  // Find vendors mentioned in message OR in recent conversation history
  const mentionedVendors = allVendors.filter((v: any) => {
    const vName = v.name.toLowerCase();
    const vParts = vName.split(/\s+/).filter((p: string) => p.length >= 3);
    const msgWords = fullContext.split(/\s+/).filter((w: string) => w.length >= 3);
    return vParts.some((part: string) => fullContext.includes(part)) ||
           msgWords.some((word: string) => vName.includes(word));
  });

  // ===== PURCHASE ORDERS WITH UTILIZATION =====
  const allPOs = await db('purchase_orders')
    .join('vendors', 'purchase_orders.vendor_id', 'vendors.id')
    .select(
      'purchase_orders.*',
      'vendors.name as vendor_name',
      'vendors.service_type as vendor_service_type',
      'vendors.gstin as vendor_gstin',
      'vendors.pan as vendor_pan'
    );

  // Calculate utilization and CORRECT expiry status for each PO
  for (const po of allPOs) {
    // Determine actual expiry status based on dates
    let isActuallyExpired = Boolean(po.is_expired);
    let daysLeft: number | null = null;

    if (po.validity_date) {
      // Parse date (handle DD/MM/YYYY and YYYY-MM-DD)
      let endDate: Date;
      const parts = String(po.validity_date).split('/');
      if (parts.length === 3) {
        endDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      } else {
        endDate = new Date(po.validity_date);
      }
      if (!isNaN(endDate.getTime())) {
        daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
        isActuallyExpired = daysLeft < 0;
      }
    }

    // Attach computed fields
    (po as any)._status = isActuallyExpired ? 'EXPIRED' : 'ACTIVE';
    (po as any)._daysLeft = daysLeft;
    (po as any)._statusLabel = isActuallyExpired
      ? 'EXPIRED'
      : daysLeft !== null
        ? (daysLeft <= 30 ? `ACTIVE (${daysLeft} days left - expiring soon)` : `ACTIVE (${daysLeft} days left)`)
        : 'ACTIVE (no end date)';
  }

  // Calculate utilization for each PO
  const poUtilization = await db('billing_records')
    .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
    .groupBy('billing_records.purchase_order_id')
    .select('billing_records.purchase_order_id')
    .sum('invoices.invoice_value as total_billed')
    .count('* as bill_count');

  const utilizationMap: Record<number, { billed: number; count: number }> = {};
  for (const u of poUtilization) {
    utilizationMap[u.purchase_order_id] = { billed: Number(u.total_billed || 0), count: Number(u.bill_count || 0) };
  }

  // ===== VENDOR SERVICES =====
  const allServices = await db('vendor_services')
    .join('vendors', 'vendor_services.vendor_id', 'vendors.id')
    .join('sections', 'vendor_services.section_id', 'sections.id')
    .select(
      'vendor_services.*',
      'vendors.name as vendor_name',
      'sections.name as department_name',
      'sections.code as department_code'
    );

  // ===== BILLING DATA =====
  const recentBills = await db('billing_records')
    .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
    .join('vendors', 'billing_records.vendor_id', 'vendors.id')
    .select(
      'billing_records.*',
      'invoices.invoice_number', 'invoices.invoice_value', 'invoices.invoice_date',
      'invoices.basic_value', 'invoices.gst_amount', 'invoices.gst_percentage',
      'vendors.name as vendor_name'
    )
    .orderBy('billing_records.billing_period_year', 'desc')
    .orderBy('billing_records.billing_period_month', 'desc')
    .limit(50);

  // ===== SECTIONS/DEPARTMENTS =====
  const sections = await db('sections').select('*');

  // ===== COMPANY INFO =====
  const company = await db('company_info').first();

  // ===== BUILD CONTEXT =====

  // Mentioned vendors — FULL details
  if (mentionedVendors.length > 0) {
    parts.push(`\n=== MATCHED VENDOR DETAILS ===`);
    for (const v of mentionedVendors) {
      const vendorPOs = allPOs.filter((p: any) => p.vendor_id === v.id);
      const vendorBills = recentBills.filter((b: any) => b.vendor_id === v.id);
      const vendorServices = allServices.filter((s: any) => s.vendor_id === v.id);
      const totalBilled = vendorBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
      const paidBills = vendorBills.filter((b: any) => b.payment_status === 'paid');
      const pendingBills = vendorBills.filter((b: any) => b.payment_status !== 'paid');

      // Pre-calculate PO status
      const currentPOs = vendorPOs.filter((po: any) => {
        if (po.is_expired) return false;
        if (!po.validity_date) return true;
        return new Date(po.validity_date).getTime() >= today.getTime();
      });
      const expiredPOs = vendorPOs.filter((po: any) => {
        if (po.is_expired) return true;
        if (!po.validity_date) return false;
        return new Date(po.validity_date).getTime() < today.getTime();
      });

      parts.push(`
VENDOR: ${v.name}
  Code: ${v.vendor_code || 'N/A'} | Type: ${v.vendor_type || 'N/A'} | Service: ${v.service_type}
  GSTIN: ${v.gstin || 'N/A'} | PAN: ${v.pan || 'N/A'} | GST Registered: ${v.gst_registered ? 'Yes' : 'No'}
  Phone: ${v.phone || 'N/A'} | Email: ${v.email || 'N/A'}
  Address: ${v.address || 'N/A'}, ${v.state || 'N/A'} ${v.pincode || ''}
  Bank: ${v.bank_name || 'N/A'} | A/c: ${v.bank_account_no || 'N/A'} | IFSC: ${v.bank_ifsc || 'N/A'}
  
  CURRENT/ACTIVE POs (${currentPOs.length}):${currentPOs.map((po: any) => {
    const util = utilizationMap[po.id] || { billed: 0, count: 0 };
    const pct = Number(po.po_value) > 0 ? ((util.billed / Number(po.po_value)) * 100).toFixed(1) : '0';
    const daysLeft = po.validity_date ? Math.ceil((new Date(po.validity_date).getTime() - today.getTime()) / 86400000) : null;
    return `\n    ✅ PO ${po.po_number} [ACTIVE, ${daysLeft !== null ? daysLeft + ' days remaining' : 'no end date'}]: ₹${Number(po.po_value).toLocaleString('en-IN')} | Period: ${po.po_date || po.service_start_date || 'N/A'} to ${po.validity_date || po.service_end_date || 'N/A'} | Billed: ₹${util.billed.toLocaleString('en-IN')} (${pct}%) [${util.count} bills] | Remaining: ₹${(Number(po.po_value) - util.billed).toLocaleString('en-IN')} | Service: ${po.service_description || 'N/A'}`;
  }).join('') || '\n    (None)'}
  
  EXPIRED POs (${expiredPOs.length}):${expiredPOs.map((po: any) => {
    const util = utilizationMap[po.id] || { billed: 0, count: 0 };
    const pct = Number(po.po_value) > 0 ? ((util.billed / Number(po.po_value)) * 100).toFixed(1) : '0';
    return `\n    ❌ PO ${po.po_number} [EXPIRED]: ₹${Number(po.po_value).toLocaleString('en-IN')} | Was valid: ${po.po_date || po.service_start_date || 'N/A'} to ${po.validity_date || po.service_end_date || 'N/A'} | Billed: ₹${util.billed.toLocaleString('en-IN')} (${pct}%) | Service: ${po.service_description || 'N/A'}`;
  }).join('') || '\n    (None)'}
  
  SERVICES (${vendorServices.length}):${vendorServices.map((s: any) => `\n    ${s.service_type}${s.service_subtype ? ' - ' + s.service_subtype : ''} | Dept: ${s.department_name} (${s.department_code}) | PO: ${s.po_number || 'N/A'} | HSN: ${s.hsn_sac || 'N/A'}`).join('')}
  
  BILLING SUMMARY: Total Billed: ₹${totalBilled.toLocaleString('en-IN')} | Paid: ${paidBills.length} bills (₹${paidBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0).toLocaleString('en-IN')}) | Pending: ${pendingBills.length} bills (₹${pendingBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0).toLocaleString('en-IN')})
  RECENT BILLS:${vendorBills.slice(0, 10).map((b: any) => `\n    ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(b.billing_period_month || 1) - 1]}'${b.billing_period_year}: Inv ${b.invoice_number || 'N/A'} | ₹${Number(b.invoice_value || 0).toLocaleString('en-IN')} | Status: ${b.payment_status} | Paid: ₹${b.paid_amount || 0} | UTR: ${b.utr_details || 'N/A'}`).join('')}`);
    }
  }

  // PO number mentioned
  const poNumbers = message.match(/\d{7,}/g) || [];
  if (poNumbers.length > 0) {
    parts.push(`\n=== SPECIFIC PO DETAILS ===`);
    for (const num of poNumbers) {
      const po = allPOs.find((p: any) => String(p.po_number).includes(num));
      if (po) {
        const util = utilizationMap[po.id] || { billed: 0, count: 0 };
        const pct = Number(po.po_value) > 0 ? ((util.billed / Number(po.po_value)) * 100).toFixed(1) : '0';
        parts.push(`PO ${po.po_number}:
  Vendor: ${po.vendor_name} | Service: ${po.vendor_service_type}
  Value: ₹${Number(po.po_value).toLocaleString('en-IN')}
  Period: ${po.po_date || po.service_start_date || 'N/A'} to ${po.validity_date || po.service_end_date || 'N/A'}
  STATUS: ${(po as any)._statusLabel}
  Utilization: ${pct}% (₹${util.billed.toLocaleString('en-IN')} billed in ${util.count} bills)
  Remaining: ₹${(Number(po.po_value) - util.billed).toLocaleString('en-IN')}
  Description: ${po.service_description || 'N/A'}
  Vendor GSTIN: ${po.vendor_gstin || 'N/A'} | PAN: ${po.vendor_pan || 'N/A'}`);
      }
    }
  }

  // Service type queries — compare vendors
  const serviceKeywords = ['crane', 'bus', 'bolero', 'camper', 'hydra', 'palfinger', 'hospitality', 'rent', 'food', 'transport', 'electrical', 'pipeline', 'cmms', 'labour', 'manpower', 'house', 'tipper', 'forklift'];
  const matchedService = serviceKeywords.find(s => msg.includes(s));
  if (matchedService || msg.includes('compare') || msg.includes('service')) {
    const serviceFilter = matchedService || '';
    const filteredVendors = serviceFilter
      ? allVendors.filter((v: any) => v.service_type?.toLowerCase().includes(serviceFilter))
      : allVendors;

    if (filteredVendors.length > 0 && filteredVendors.length <= 20) {
      parts.push(`\n=== VENDORS FOR "${serviceFilter || 'all'}" SERVICE ===`);
      for (const v of filteredVendors) {
        const vPOs = allPOs.filter((p: any) => p.vendor_id === v.id && !p.is_expired);
        const totalVal = vPOs.reduce((s: number, p: any) => s + Number(p.po_value || 0), 0);
        const latestPO = vPOs[vPOs.length - 1];
        parts.push(`  ${v.name} (${v.vendor_code || 'N/A'}): ${vPOs.length} active POs, Total: ₹${totalVal.toLocaleString('en-IN')}${latestPO ? `, Latest: PO ${latestPO.po_number} (₹${Number(latestPO.po_value).toLocaleString('en-IN')})` : ''}`);
      }
    }
  }

  // Expiry queries
  if (fullContext.includes('expir') || msg.includes('ending') || msg.includes('validity') || msg.includes('expire')) {
    const expiredPOs = allPOs.filter((p: any) => (p as any)._status === 'EXPIRED');
    const expiringSoonPOs = allPOs.filter((p: any) => (p as any)._status !== 'EXPIRED' && (p as any)._daysLeft !== null && (p as any)._daysLeft <= 30 && (p as any)._daysLeft > 0);

    if (expiredPOs.length > 0) {
      parts.push(`\n=== EXPIRED POs (${expiredPOs.length}) ===`);
      for (const po of expiredPOs) {
        parts.push(`  PO ${po.po_number} (${po.vendor_name}): Was valid till ${po.validity_date || 'N/A'} | Value: ₹${Number(po.po_value).toLocaleString('en-IN')} | STATUS: EXPIRED`);
      }
    } else {
      parts.push(`\n=== EXPIRED POs: NONE — All POs are currently active! ===`);
    }

    if (expiringSoonPOs.length > 0) {
      parts.push(`\n=== POs EXPIRING SOON (next 30 days) — ${expiringSoonPOs.length} ===`);
      for (const po of expiringSoonPOs) {
        parts.push(`  PO ${po.po_number} (${po.vendor_name}): Expires ${po.validity_date} [${(po as any)._daysLeft} days left] | Value: ₹${Number(po.po_value).toLocaleString('en-IN')} | STATUS: ACTIVE but expiring soon`);
      }
    }
  }

  // Billing/payment queries — check current message AND history context
  if (fullContext.includes('bill') || fullContext.includes('invoice') || fullContext.includes('payment') || fullContext.includes('paid') || fullContext.includes('pending') || fullContext.includes('kab') || fullContext.includes('amount') || mentionedVendors.length > 0) {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const paidTotal = recentBills.filter((b: any) => b.payment_status === 'paid').reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
    const pendingTotal = recentBills.filter((b: any) => b.payment_status !== 'paid').reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);

    parts.push(`\n=== BILLING OVERVIEW ===
Total Paid: ₹${paidTotal.toLocaleString('en-IN')} (${recentBills.filter((b: any) => b.payment_status === 'paid').length} bills)
Total Pending: ₹${pendingTotal.toLocaleString('en-IN')} (${recentBills.filter((b: any) => b.payment_status !== 'paid').length} bills)
Recent Bills:`);
    for (const b of recentBills.slice(0, 20)) {
      parts.push(`  ${b.vendor_name} | ${MONTHS[(b.billing_period_month || 1) - 1]}'${b.billing_period_year} | Inv: ${b.invoice_number || 'N/A'} | Basic: ₹${Number(b.basic_value || 0).toLocaleString('en-IN')} + GST: ₹${Number(b.gst_amount || 0).toLocaleString('en-IN')} = ₹${Number(b.invoice_value || 0).toLocaleString('en-IN')} | ${b.payment_status}`);
    }
  }

  // Department queries
  if (fullContext.includes('department') || msg.includes('section') || msg.includes('refinery') || msg.includes('power')) {
    parts.push(`\n=== DEPARTMENTS ===`);
    for (const sec of sections) {
      const deptServices = allServices.filter((s: any) => s.section_id === sec.id);
      const deptVendors = [...new Set(deptServices.map((s: any) => s.vendor_name))];
      parts.push(`  ${sec.name} (${sec.code}): ${deptVendors.length} vendors — ${deptVendors.join(', ')}`);
    }
  }

  // If no specific match, provide full vendor list with PO summary
  if (mentionedVendors.length === 0 && poNumbers.length === 0 && !matchedService) {
    parts.push(`\n=== ALL VENDORS WITH PO SUMMARY ===`);
    for (const v of allVendors.slice(0, 40)) {
      const vPOs = allPOs.filter((p: any) => p.vendor_id === v.id);
      const activePOs = vPOs.filter((p: any) => !p.is_expired);
      const totalVal = activePOs.reduce((s: number, p: any) => s + Number(p.po_value || 0), 0);
      parts.push(`  ${v.name} | ${v.service_type} | POs: ${activePOs.length} active (₹${totalVal.toLocaleString('en-IN')}) | Code: ${v.vendor_code || 'N/A'}`);
    }
  }

  // Company info
  if (company && (msg.includes('company') || msg.includes('bluspring') || msg.includes('gstin') || msg.includes('our'))) {
    parts.push(`\n=== COMPANY INFO ===
Name: ${company.name} | GSTIN: ${company.gstin} | PAN: ${company.pan}
State: ${company.state} (${company.state_code}) | Address: ${company.address}
Phone: ${company.phone} | Email: ${company.email}`);
  }

  const contextText = parts.join('\n');
  const summary = `System: ${vendorCount?.c} vendors, ${activePoCount?.c} active POs (₹${Number(totalPOValue?.total || 0).toLocaleString('en-IN')})`;

  return { contextText, summary };
}
