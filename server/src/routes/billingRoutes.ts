import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { calculateBilling, numToWords } from '../services/billingEngine.js';
import { createNotification } from '../services/notificationService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';

const UPLOAD_DIR = path.resolve('data/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const billUpload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

export function createBillingRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // ===== STATIC ROUTES (before /:vendorId parameterized routes) =====

  // Calculate billing
  router.post('/calculate', async (req: Request, res: Response) => {
    try {
      const result = calculateBilling(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Calculation failed' });
    }
  });

  // Save bill from Tax Invoice wizard
  router.post('/save-bill', async (req: Request, res: Response) => {
    try {
      const { vendorId, serviceId, serviceType, sectionId, invoiceNumber, invoiceDate, billingMonth, billingYear, taxableValue, cgst, sgst, igst, grandTotal, lineItems, category, poNumber } = req.body;
      if (!vendorId || !serviceType) { res.status(400).json({ error: 'vendorId and serviceType are required' }); return; }

      let purchaseOrderId = null;
      if (poNumber) {
        const po = await db('purchase_orders').where({ vendor_id: vendorId, po_number: poNumber }).first();
        if (po) purchaseOrderId = po.id;
      }

      const billingRecordId_res = await db('billing_records').insert({
        vendor_id: vendorId, purchase_order_id: purchaseOrderId, section_id: sectionId || null,
        billing_period_month: billingMonth, billing_period_year: billingYear, status: 'completed',
        created_at: db.fn.now(), updated_at: db.fn.now(),
      }).returning("id"); const billingRecordId = typeof billingRecordId_res[0] === "object" ? (billingRecordId_res[0] as any).id : billingRecordId_res[0];

      const gstPct = (cgst + sgst) > 0 ? ((cgst + sgst) / taxableValue * 100) : (igst > 0 ? (igst / taxableValue * 100) : 18);
      const invoiceId_res = await db('invoices').insert({
        billing_record_id: billingRecordId, invoice_number: invoiceNumber, invoice_date: invoiceDate,
        nature: 'Original', basic_value: taxableValue, gst_percentage: gstPct,
        gst_amount: cgst + sgst + igst, invoice_value: grandTotal,
        hsn_sac_code: lineItems?.[0]?.hsnSac || '', service_type: serviceType,
      }).returning("id"); const invoiceId = typeof invoiceId_res[0] === "object" ? (invoiceId_res[0] as any).id : invoiceId_res[0];

      if (lineItems?.length) {
        await db('invoice_line_items').insert(lineItems.map((li: any, i: number) => ({
          invoice_id: invoiceId, sr_no: i + 1, description: li.description,
          hsn_sac: li.hsnSac || '', quantity: li.qty || 1, unit: li.uom || 'LS',
          unit_price: li.rate || 0, amount: li.amount || 0,
          is_diesel: (li.description || '').toLowerCase().includes('diesel'),
        })));
      }

      // Create notification for invoice submission
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const vendor = await db('vendors').where('id', vendorId).select('name').first();
      const vendorName = vendor?.name || 'vendor';
      const monthLabel = MONTHS[(billingMonth || 1) - 1] || '';
      createNotification(db, {
        type: 'invoice_submitted',
        title: `Invoice is submitted for ${vendorName} for ${monthLabel} ${billingYear || ''}`,
        message: `Invoice is submitted for ${vendorName} for ${monthLabel} ${billingYear || ''}`,
        vendor_id: vendorId,
      }).catch(() => {});

      res.status(201).json({ billingRecordId, invoiceId, grandTotal });
    } catch (error: any) {
      console.error('Save bill error:', error);
      res.status(500).json({ error: 'Failed to save bill: ' + (error.message || '') });
    }
  });

  // Update bill details (payment status, UTR, etc.)
  router.post('/update-bill/:billingRecordId', async (req: Request, res: Response) => {
    try {
      const { billingRecordId } = req.params;
      const { paymentStatus, utrDetails, paymentDate, paidAmount, deductionAmount, remarks } = req.body;

      const record = await db('billing_records').where('id', billingRecordId).first();
      if (!record) { res.status(404).json({ error: 'Bill not found' }); return; }

      await db('billing_records').where('id', billingRecordId).update({
        payment_status: paymentStatus || record.payment_status,
        utr_details: utrDetails !== undefined ? utrDetails : record.utr_details,
        payment_date: paymentDate || record.payment_date,
        paid_amount: paidAmount ? parseFloat(paidAmount) : record.paid_amount,
        deduction_amount: deductionAmount !== undefined ? parseFloat(deductionAmount) : record.deduction_amount,
        remarks: remarks !== undefined ? remarks : record.remarks,
        updated_at: db.fn.now(),
      });

      // Create notification when payment is completed
      if (paymentStatus === 'paid' && record.payment_status !== 'paid') {
        const MONTHS_PAY = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const vendor = await db('vendors').where('id', record.vendor_id).select('name').first();
        const vendorName = vendor?.name || 'vendor';
        const monthLabel = MONTHS_PAY[(record.billing_period_month || 1) - 1] || '';
        createNotification(db, {
          type: 'payment_completed',
          title: `Payment is completed for ${vendorName} for ${monthLabel} ${record.billing_period_year || ''}`,
          message: `Payment is completed for ${vendorName} for ${monthLabel} ${record.billing_period_year || ''}`,
          vendor_id: record.vendor_id,
        }).catch(() => {});
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update: ' + (error.message || '') });
    }
  });

  // Delete multiple bills
  router.post('/delete-bills', async (req: Request, res: Response) => {
    try {
      const { billIds } = req.body;
      if (!billIds?.length) { res.status(400).json({ error: 'billIds array is required' }); return; }

      // Delete invoices and billing records for each bill
      for (const billId of billIds) {
        // Delete invoice line items
        const invoice = await db('invoices').where('billing_record_id', billId).first();
        if (invoice) {
          await db('invoice_line_items').where('invoice_id', invoice.id).del();
        }
        // Delete related records
        await db('invoices').where('billing_record_id', billId).del();
        await db('log_entries').whereIn('log_sheet_id', db('log_sheets').where('billing_record_id', billId).select('id')).del();
        await db('log_sheets').where('billing_record_id', billId).del();
        await db('wcr_signatories').whereIn('wcr_id', db('work_completion_reports').where('billing_record_id', billId).select('id')).del();
        await db('work_completion_reports').where('billing_record_id', billId).del();
        await db('billing_records').where('id', billId).del();
      }

      res.json({ deleted: billIds.length });
    } catch (error: any) {
      console.error('Delete bills error:', error);
      res.status(500).json({ error: 'Failed to delete: ' + (error.message || '') });
    }
  });

  // Import bills from parsed data (after preview confirmation)
  router.post('/import-bills-data', async (req: Request, res: Response) => {
    try {
      const { vendorId, records } = req.body;
      if (!vendorId || !records?.length) { res.status(400).json({ error: 'vendorId and records are required' }); return; }

      const monthNames: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, april:4, may:5, jun:6, june:6, jul:7, july:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
      let imported = 0;

      for (const r of records) {
        const invoiceNumber = r.invoiceNumber || '';
        const invoiceValueRaw = String(r.invoiceValue || '0').replace(/[₹,\s"]/g, '');
        const invoiceValue = parseFloat(invoiceValueRaw) || 0;
        if (!invoiceNumber && invoiceValue === 0) continue;

        const basicValueRaw = String(r.basicValue || '0').replace(/[₹,\s"]/g, '');
        const basicValue = parseFloat(basicValueRaw) || invoiceValue;
        const gstRaw = String(r.gst || '0').replace(/[₹,\s"]/g, '');
        const gst = parseFloat(gstRaw) || 0;
        const finalValue = invoiceValue || (basicValue + gst);

        // Parse month
        let billingMonth = new Date().getMonth() + 1;
        let billingYear = new Date().getFullYear();
        const monthRaw = r.month || '';
        const monthMatch = monthRaw.match(/^([a-zA-Z]+)['\s]*(\d{2,4})?$/);
        if (monthMatch) {
          const mName = monthMatch[1].toLowerCase();
          if (monthNames[mName]) billingMonth = monthNames[mName];
          if (monthMatch[2]) billingYear = monthMatch[2].length === 2 ? 2000 + parseInt(monthMatch[2]) : parseInt(monthMatch[2]);
        }

        const serviceType = r.serviceType || '';
        const poNumber = r.poNumber || '';
        const paymentStatus = (r.paymentStatus || '').toLowerCase().includes('done') || (r.paymentStatus || '').toLowerCase().includes('paid') ? 'paid' : 'pending';
        const utr = r.utr || '';
        const paidAmountRaw = String(r.paidAmount || '0').replace(/[₹,\s"]/g, '');
        const paidAmount = parseFloat(paidAmountRaw) || 0;
        const deductionRaw = String(r.deduction || '0').replace(/[₹,\s"]/g, '');
        const deduction = parseFloat(deductionRaw) || 0;
        const remarks = r.remarks || '';
        const invoiceDate = r.invoiceDate || null;

        let purchaseOrderId = null;
        if (poNumber) {
          const cleanPO = poNumber.replace(/[\(\-].*$/, '').trim();
          const po = await db('purchase_orders').where({ vendor_id: vendorId, po_number: cleanPO }).first();
          if (po) purchaseOrderId = po.id;
        }

        let sectionId = null;
        if (serviceType) {
          const svc = await db('vendor_services').where({ vendor_id: vendorId }).whereRaw('LOWER(service_type) LIKE ?', [`%${serviceType.toLowerCase().split(' ')[0]}%`]).first();
          if (svc) sectionId = svc.section_id;
        }

        const billingRecordId_res = await db('billing_records').insert({
          vendor_id: vendorId, purchase_order_id: purchaseOrderId, section_id: sectionId,
          billing_period_month: billingMonth, billing_period_year: billingYear,
          status: 'completed', payment_status: paymentStatus, deduction_amount: deduction,
          paid_amount: paidAmount || (paymentStatus === 'paid' ? finalValue : null),
          utr_details: utr || null, remarks: remarks || null, finalized: true,
          created_at: db.fn.now(), updated_at: db.fn.now(),
        }).returning("id"); const billingRecordId = typeof billingRecordId_res[0] === "object" ? (billingRecordId_res[0] as any).id : billingRecordId_res[0];

        await db('invoices').insert({
          billing_record_id: billingRecordId,
          invoice_number: invoiceNumber || `IMP-${billingRecordId}`,
          invoice_date: invoiceDate || null, nature: 'Original',
          basic_value: basicValue, gst_percentage: basicValue > 0 && gst > 0 ? (gst / basicValue * 100) : 0,
          gst_amount: gst, invoice_value: finalValue, service_type: serviceType || null,
        });

        imported++;
      }

      res.status(201).json({ imported, total: records.length });
    } catch (error: any) {
      console.error('Import bills data error:', error);
      res.status(500).json({ error: 'Failed to import: ' + (error.message || '') });
    }
  });

  // Preview bills from Excel (read & show data without importing)
  router.post('/preview-bills', billUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      const vendorName = req.body.vendorName || '';
      if (!file) { res.status(400).json({ error: 'File is required' }); return; }

      const workbook = new ExcelJS.Workbook();
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.csv') { await workbook.csv.readFile(file.path); } else { await workbook.xlsx.readFile(file.path); }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) { fs.unlinkSync(file.path); res.status(400).json({ error: 'No worksheet found' }); return; }

      // Find header row
      let headerCells: string[] = [];
      let headerIdx = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (headerCells.length > 0) return;
        const cells = row.values as any[];
        const joined = cells.map(v => String(v || '').toLowerCase()).join(' ');
        if (joined.includes('invoice') && (joined.includes('value') || joined.includes('amount') || joined.includes('date'))) {
          // ExcelJS row.values is 1-indexed, index 0 is undefined
          headerCells = cells.map((v: any) => v ? String(v).trim() : '');
          headerIdx = rowNumber;
        }
      });
      if (headerCells.length === 0) {
        const firstRow = worksheet.getRow(1).values as any[];
        headerCells = firstRow.map((v: any) => v ? String(v).trim() : '');
        headerIdx = 1;
      }

      // Build clean headers list (skip empty and "Sl No")
      const displayHeaders = headerCells.filter(h => h && h.toLowerCase() !== 'sl no' && h.toLowerCase() !== 'sl. no');

      // Map column indices by exact header position (1-indexed from ExcelJS)
      const colMap: Record<string, number> = {};
      headerCells.forEach((h: string, idx: number) => {
        if (!h) return;
        const hl = h.toLowerCase().trim();
        // Skip serial number column
        if (hl === 'sl no' || hl === 'sl. no' || hl === 's.no' || hl === 'sr no') return;

        if (hl === 'invoice number' || hl === 'invoice no' || hl === 'inv no') colMap.invoiceNumber = idx;
        else if (hl === 'invoice date' || hl === 'inv date') colMap.invoiceDate = idx;
        else if (hl === 'inv receipt date' || hl.includes('receipt date')) colMap.receiptDate = idx;
        else if (hl === 'month of invoice' || hl === 'month') colMap.month = idx;
        else if (hl === 'types of service' || hl === 'type of service' || hl === 'service type') colMap.serviceType = idx;
        else if (hl === 'p.o number' || hl === 'po number' || hl === 'p.o no') colMap.poNumber = idx;
        else if (hl === 'vendor code') colMap.vendorCode = idx;
        else if (hl === 'p.o date' || hl === 'po date') colMap.poDate = idx;
        else if (hl === 'validity') colMap.validity = idx;
        else if (hl === 'po value' || hl === 'p.o value') colMap.poValue = idx;
        else if (hl === 'balance po value' || hl.includes('balance')) colMap.balancePoValue = idx;
        else if (hl === 'basic value') colMap.basicValue = idx;
        else if (hl === 'gst') colMap.gst = idx;
        else if (hl === 'invoice value') colMap.invoiceValue = idx;
        else if (hl === 'payment status') colMap.paymentStatus = idx;
        else if (hl === 'deduction amount' || hl.includes('deduction')) colMap.deduction = idx;
        else if (hl === 'paid amount') colMap.paidAmount = idx;
        else if (hl === 'utr details' || hl.includes('utr')) colMap.utr = idx;
        else if (hl === 'payment date') colMap.paymentDate = idx;
        else if (hl === 'remarks' || hl === 'remark') colMap.remarks = idx;
        else if (hl === 'vendor name') colMap.vendorName = idx;
      });

      // Read all data rows
      const records: any[] = [];
      const allVendors = new Set<string>();
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerIdx) return;
        const vals = row.values as any[];
        const hasData = vals.some(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (!hasData) return;

        const getVal = (key: string) => {
          const idx = colMap[key];
          if (idx === undefined || idx === null) return '';
          const v = vals[idx];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.result !== undefined) return String(v.result);
          if (typeof v === 'object' && v.text) return String(v.text);
          if (typeof v === 'object' && v instanceof Date) {
            return `${v.getMonth()+1}/${v.getDate()}/${v.getFullYear()}`;
          }
          return String(v).trim();
        };

        const rowVendor = getVal('vendorName');
        if (rowVendor) allVendors.add(rowVendor);

        // Filter by vendor name if provided
        if (vendorName) {
          if (rowVendor && !rowVendor.toLowerCase().includes(vendorName.toLowerCase()) && !vendorName.toLowerCase().includes(rowVendor.toLowerCase())) {
            return;
          }
        }

        records.push({
          invoiceNumber: getVal('invoiceNumber'),
          invoiceDate: getVal('invoiceDate'),
          receiptDate: getVal('receiptDate'),
          month: getVal('month'),
          serviceType: getVal('serviceType'),
          poNumber: getVal('poNumber'),
          vendorCode: getVal('vendorCode'),
          poDate: getVal('poDate'),
          validity: getVal('validity'),
          poValue: getVal('poValue'),
          balancePoValue: getVal('balancePoValue'),
          basicValue: getVal('basicValue'),
          gst: getVal('gst'),
          invoiceValue: getVal('invoiceValue'),
          paymentStatus: getVal('paymentStatus'),
          deduction: getVal('deduction'),
          paidAmount: getVal('paidAmount'),
          utr: getVal('utr'),
          paymentDate: getVal('paymentDate'),
          remarks: getVal('remarks'),
        });
      });

      // Clean up file
      fs.unlinkSync(file.path);

      res.json({
        fileName: file.originalname,
        headers: displayHeaders,
        columnMapping: colMap,
        totalRows: records.length,
        vendorFilter: vendorName,
        vendorsFound: [...allVendors].sort(),
        records,
        summary: {
          totalBills: records.length,
          uniquePOs: [...new Set(records.map(r => r.poNumber).filter(Boolean))],
          uniqueServices: [...new Set(records.map(r => r.serviceType).filter(Boolean))],
          months: [...new Set(records.map(r => r.month).filter(Boolean))].sort(),
        }
      });
    } catch (error: any) {
      console.error('Preview bills error:', error);
      res.status(500).json({ error: 'Failed to read file: ' + (error.message || '') });
    }
  });

  // Import previous bills from Excel
  router.post('/import-bills', billUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      const vendorId = parseInt(req.body.vendorId);
      if (!file || !vendorId) { res.status(400).json({ error: 'File and vendorId are required' }); return; }

      const workbook = new ExcelJS.Workbook();
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.csv') { await workbook.csv.readFile(file.path); } else { await workbook.xlsx.readFile(file.path); }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) { fs.unlinkSync(file.path); res.status(400).json({ error: 'No worksheet found' }); return; }

      // Find header row
      let headerRow: any = null;
      let headerIdx = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (headerRow) return;
        const vals = row.values as any[];
        const joined = vals.map(v => String(v || '').toLowerCase()).join(' ');
        if (joined.includes('invoice') && (joined.includes('value') || joined.includes('amount') || joined.includes('date'))) {
          headerRow = vals; headerIdx = rowNumber;
        }
      });
      if (!headerRow) { headerRow = worksheet.getRow(1).values as any[]; headerIdx = 1; }

      // Map columns
      const colMap: Record<string, number> = {};
      (headerRow as any[]).forEach((val: any, idx: number) => {
        if (!val) return;
        const h = String(val).toLowerCase().trim();
        if ((h.includes('invoice') && h.includes('no')) || h === 'invoice number') colMap.invoiceNumber = idx;
        else if (h.includes('invoice') && h.includes('date')) colMap.invoiceDate = idx;
        else if (h.includes('inv') && h.includes('receipt')) colMap.invoiceReceiptDate = idx;
        else if (h === 'month' || h.includes('month of')) colMap.month = idx;
        else if (h === 'year') colMap.year = idx;
        else if (h.includes('types of service') || h.includes('service type') || h === 'service') colMap.serviceType = idx;
        else if (h.includes('p.o number') || h.includes('po number') || h === 'po no') colMap.poNumber = idx;
        else if (h.includes('basic') && h.includes('value')) colMap.basicValue = idx;
        else if (h === 'gst' || h.includes('gst amount')) colMap.gst = idx;
        else if (h.includes('invoice') && h.includes('value')) colMap.invoiceValue = idx;
        else if (h.includes('payment') && h.includes('status')) colMap.paymentStatus = idx;
        else if (h.includes('utr')) colMap.utr = idx;
        else if (h.includes('paid') && h.includes('amount')) colMap.paidAmount = idx;
        else if (h.includes('payment') && h.includes('date')) colMap.paymentDate = idx;
        else if (h.includes('deduction')) colMap.deduction = idx;
        else if (h.includes('remark')) colMap.remarks = idx;
        else if (h.includes('po value') || h === 'po value') colMap.poValue = idx;
        else if (h.includes('vendor code')) colMap.vendorCode = idx;
      });

      let imported = 0;
      const rows: any[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerIdx) return;
        const vals = row.values as any[];
        const hasData = vals.some(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (!hasData) return;
        rows.push(vals);
      });

      for (const vals of rows) {
        const getVal = (key: string) => {
          const idx = colMap[key];
          if (!idx) return '';
          const v = vals[idx];
          if (v && typeof v === 'object' && v.result !== undefined) return String(v.result);
          if (v && typeof v === 'object' && v.text) return String(v.text);
          return v !== null && v !== undefined ? String(v).trim() : '';
        };
        const getNum = (key: string) => {
          const v = getVal(key);
          const cleaned = v.replace(/[₹,\s"]/g, '');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        };

        const invoiceNumber = getVal('invoiceNumber');
        const invoiceValue = getNum('invoiceValue');
        if (!invoiceNumber && invoiceValue === 0) continue;

        const basicValue = getNum('basicValue') || invoiceValue;
        const gst = getNum('gst');
        const finalValue = invoiceValue || (basicValue + gst);

        // Parse month from "Month of Invoice" column (e.g. "Mar'2023", "June'2023", "sep'24")
        let billingMonth = new Date().getMonth() + 1;
        let billingYear = new Date().getFullYear();
        const monthRaw = getVal('month');
        const monthNames: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, april:4, may:5, jun:6, june:6, jul:7, july:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
        const monthMatch = monthRaw.match(/^([a-zA-Z]+)['\s]*(\d{2,4})?$/);
        if (monthMatch) {
          const mName = monthMatch[1].toLowerCase();
          if (monthNames[mName]) billingMonth = monthNames[mName];
          if (monthMatch[2]) {
            billingYear = monthMatch[2].length === 2 ? 2000 + parseInt(monthMatch[2]) : parseInt(monthMatch[2]);
          }
        } else {
          const numMonth = parseInt(monthRaw);
          if (numMonth >= 1 && numMonth <= 12) billingMonth = numMonth;
        }

        const serviceType = getVal('serviceType');
        const poNumber = getVal('poNumber');
        const paymentStatus = getVal('paymentStatus').toLowerCase().includes('done') || getVal('paymentStatus').toLowerCase().includes('paid') ? 'paid' : 'pending';
        const utr = getVal('utr');
        const paidAmount = getNum('paidAmount');
        const deduction = getNum('deduction');
        const remarks = getVal('remarks');
        const invoiceDate = getVal('invoiceDate');

        let purchaseOrderId = null;
        if (poNumber) {
          // Clean PO number (remove suffixes like "(Bus)", "-Bus", etc.)
          const cleanPO = poNumber.replace(/[\(\-].*$/, '').trim();
          const po = await db('purchase_orders').where({ vendor_id: vendorId, po_number: cleanPO }).first();
          if (po) purchaseOrderId = po.id;
        }

        let sectionId = null;
        if (serviceType) {
          const svc = await db('vendor_services').where({ vendor_id: vendorId }).whereRaw('LOWER(service_type) LIKE ?', [`%${serviceType.toLowerCase().split(' ')[0]}%`]).first();
          if (svc) sectionId = svc.section_id;
        }

        const billingRecordId_res = await db('billing_records').insert({
          vendor_id: vendorId, purchase_order_id: purchaseOrderId, section_id: sectionId,
          billing_period_month: billingMonth, billing_period_year: billingYear,
          status: 'completed', payment_status: paymentStatus, deduction_amount: deduction,
          paid_amount: paidAmount || (paymentStatus === 'paid' ? finalValue : null),
          utr_details: utr || null, remarks: remarks || null, finalized: true,
          created_at: db.fn.now(), updated_at: db.fn.now(),
        }).returning("id"); const billingRecordId = typeof billingRecordId_res[0] === "object" ? (billingRecordId_res[0] as any).id : billingRecordId_res[0];

        await db('invoices').insert({
          billing_record_id: billingRecordId,
          invoice_number: invoiceNumber || `IMP-${billingRecordId}`,
          invoice_date: invoiceDate || null, nature: 'Original',
          basic_value: basicValue, gst_percentage: basicValue > 0 && gst > 0 ? (gst / basicValue * 100) : 0,
          gst_amount: gst, invoice_value: finalValue, service_type: serviceType || null,
        });

        imported++;
      }

      fs.unlinkSync(file.path);
      res.status(201).json({ imported, total: rows.length });
    } catch (error: any) {
      console.error('Import bills error:', error);
      res.status(500).json({ error: 'Failed to import bills: ' + (error.message || '') });
    }
  });

  // Get bill detail
  router.get('/bill/:billingRecordId', async (req: Request, res: Response) => {
    try {
      const record = await db('billing_records').where('id', req.params.billingRecordId).first();
      if (!record) { res.status(404).json({ error: 'Bill not found' }); return; }
      const vendor = await db('vendors').where('id', record.vendor_id).first();
      const po = await db('purchase_orders').where('id', record.purchase_order_id).first();
      const logSheet = await db('log_sheets').where('billing_record_id', record.id).first();
      const entries = logSheet ? await db('log_entries').where('log_sheet_id', logSheet.id) : [];
      const invoice = await db('invoices').where('billing_record_id', record.id).first();
      const lineItems = invoice ? await db('invoice_line_items').where('invoice_id', invoice.id) : [];
      const wcr = await db('work_completion_reports').where('billing_record_id', record.id).first();
      const signatories = wcr ? await db('wcr_signatories').where('wcr_id', wcr.id).orderBy('sign_order') : [];
      res.json({ record, vendor, po, logSheet: logSheet ? { ...logSheet, entries } : null, invoice: invoice ? { ...invoice, lineItems } : null, wcr: wcr ? { ...wcr, signatories } : null });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch bill detail' }); }
  });

  // List all billing records
  router.get('/', async (req: Request, res: Response) => {
    try {
      const month = req.query.month as string | undefined;
      const year = req.query.year as string | undefined;
      const vendorId = req.query.vendorId as string | undefined;
      const status = req.query.status as string | undefined;
      let query = db('billing_records')
        .join('vendors', 'billing_records.vendor_id', 'vendors.id')
        .leftJoin('invoices', 'billing_records.id', 'invoices.billing_record_id')
        .select('billing_records.*', 'vendors.name as vendor_name',
          'invoices.service_type as invoice_service_type', 'vendors.service_type as vendor_service_type',
          'invoices.invoice_number', 'invoices.basic_value', 'invoices.gst_amount', 'invoices.invoice_value', 'invoices.invoice_date');
      if (month) query = query.where('billing_records.billing_period_month', month);
      if (year) query = query.where('billing_records.billing_period_year', year);
      if (vendorId) query = query.where('billing_records.vendor_id', vendorId);
      if (status) query = query.where('billing_records.status', status);
      const records = await query.orderBy('billing_records.updated_at', 'desc');
      // Use invoice-level service_type if available, else vendor-level
      const result = records.map((r: any) => ({ ...r, service_type: r.invoice_service_type || r.vendor_service_type || '' }));
      res.json(result);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch billing records' }); }
  });

  // ===== PARAMETERIZED ROUTES (/:vendorId/*) =====

  // Get wizard state
  router.get('/:vendorId/wizard-state', async (req: Request, res: Response) => {
    try {
      const month = String(req.query.month);
      const year = String(req.query.year);
      const vendorId = req.params.vendorId;
      const record = await db('billing_records')
        .where({ vendor_id: vendorId, billing_period_month: month, billing_period_year: year }).first();
      if (!record) { res.json({ currentStep: 'not_started', completedSteps: [] }); return; }
      const completedSteps: string[] = [];
      let currentStep = 'log_sheet';
      const logSheet = await db('log_sheets').where('billing_record_id', record.id).first();
      const invoice = await db('invoices').where('billing_record_id', record.id).first();
      const wcr = await db('work_completion_reports').where('billing_record_id', record.id).first();
      if (logSheet) { completedSteps.push('log_sheet'); currentStep = 'invoice'; }
      if (invoice) { completedSteps.push('invoice'); currentStep = 'wcr'; }
      if (wcr) { completedSteps.push('wcr'); currentStep = 'completed'; }
      res.json({ currentStep, completedSteps, logSheetId: logSheet?.id, invoiceId: invoice?.id, wcrId: wcr?.id, billingRecordId: record.id });
    } catch (error) { res.status(500).json({ error: 'Failed to get wizard state' }); }
  });

  // Create log sheet
  router.post('/:vendorId/log-sheet', async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId as string);
      const { month, year, periodStart, periodEnd, vehicleNumber, vehicleModel, deviceName, agreedKm, purchaseOrderId, sectionId, entries } = req.body;
      let record = await db('billing_records')
        .where({ vendor_id: vendorId, billing_period_month: month, billing_period_year: year, purchase_order_id: purchaseOrderId }).first();
      if (!record) {
        const id_res = await db('billing_records').insert({ vendor_id: vendorId, purchase_order_id: purchaseOrderId, section_id: sectionId, billing_period_month: month, billing_period_year: year, status: 'draft' }).returning("id"); const id = typeof id_res[0] === "object" ? (id_res[0] as any).id : id_res[0];
        record = { id };
      }
      const totalMileage = entries.reduce((sum: number, e: any) => sum + (parseFloat(e.totalKm) || 0), 0);
      const logSheetId_res = await db('log_sheets').insert({
        billing_record_id: record.id, period_start: periodStart, period_end: periodEnd,
        vehicle_number: vehicleNumber, vehicle_model: vehicleModel, device_name: deviceName,
        total_mileage_km: totalMileage, agreed_km: agreedKm, total_days: entries.length,
        month_starting_km: entries[0]?.startingKm || null, month_ending_km: entries[entries.length - 1]?.endingKm || null,
      }).returning("id"); const logSheetId = typeof logSheetId_res[0] === "object" ? (logSheetId_res[0] as any).id : logSheetId_res[0];
      if (entries.length > 0) {
        await db('log_entries').insert(entries.map((e: any) => ({
          log_sheet_id: logSheetId, entry_date: e.entryDate, device_name: e.deviceName,
          route_description: e.routeDescription, starting_km: e.startingKm,
          ending_km: e.endingKm, total_km: e.totalKm, remark: e.remark,
        })));
      }
      await db('billing_records').where('id', record.id).update({ status: 'log_sheet_done', updated_at: db.fn.now() });
      res.status(201).json({ id: logSheetId, billingRecordId: record.id });
    } catch (error) { res.status(500).json({ error: 'Failed to create log sheet' }); }
  });

  // Create invoice
  router.post('/:vendorId/invoice', async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId as string);
      const { month, year, invoiceNumber, invoiceDate, invoiceReceiptDate, nature, gstPercentage, hsnSacCode, billedToName, billedToAddress, consigneeAddress, deductionAmount, deductionRemarks, lineItems } = req.body;
      const record = await db('billing_records').where({ vendor_id: vendorId, billing_period_month: month, billing_period_year: year }).first();
      if (!record) { res.status(400).json({ error: 'Complete log sheet first' }); return; }
      const basicValue = lineItems.reduce((sum: number, li: any) => sum + (parseFloat(li.amount) || 0), 0);
      const gstPct = gstPercentage ?? 18;
      const gstAmount = basicValue * (gstPct / 100);
      const invoiceValue = basicValue + gstAmount;
      const invoiceId_res = await db('invoices').insert({
        billing_record_id: record.id, invoice_number: invoiceNumber, invoice_date: invoiceDate,
        invoice_receipt_date: invoiceReceiptDate, nature: nature || 'Original',
        basic_value: basicValue, gst_percentage: gstPct, gst_amount: gstAmount,
        invoice_value: invoiceValue, hsn_sac_code: hsnSacCode,
        billed_to_name: billedToName, billed_to_address: billedToAddress, consignee_address: consigneeAddress,
      }).returning("id"); const invoiceId = typeof invoiceId_res[0] === "object" ? (invoiceId_res[0] as any).id : invoiceId_res[0];
      if (lineItems?.length) {
        await db('invoice_line_items').insert(lineItems.map((li: any, i: number) => ({
          invoice_id: invoiceId, sr_no: li.srNo || i + 1, description: li.description,
          hsn_sac: li.hsnSac, quantity: li.quantity, unit: li.unit,
          unit_price: li.unitPrice, amount: li.amount, is_diesel: li.isDiesel || false,
          diesel_rate: li.dieselRate, diesel_litres: li.dieselLitres,
        })));
      }
      await db('billing_records').where('id', record.id).update({ status: 'invoice_done', deduction_amount: deductionAmount || 0, deduction_remarks: deductionRemarks, updated_at: db.fn.now() });
      res.status(201).json({ id: invoiceId, invoiceValue });
    } catch (error) { res.status(500).json({ error: 'Failed to create invoice' }); }
  });

  // Generate WCR
  router.post('/:vendorId/wcr', async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId as string);
      const { month, year, reportDate, siteName, location, clientName, workSummary, modeOfDelivery, documentsEnclosed } = req.body;
      const record = await db('billing_records').where({ vendor_id: vendorId, billing_period_month: month, billing_period_year: year }).first();
      if (!record) { res.status(400).json({ error: 'Complete invoice first' }); return; }
      const invoice = await db('invoices').where('billing_record_id', record.id).first();
      const vendor = await db('vendors').where('id', vendorId).first();
      let summary = workSummary || '';
      if (!summary) {
        const logSheet = await db('log_sheets').where('billing_record_id', record.id).first();
        summary = `${vendor.service_type} services provided for period ${logSheet?.period_start} to ${logSheet?.period_end}. Invoice: ${invoice?.invoice_number}, Value: ₹${Number(invoice?.invoice_value).toLocaleString('en-IN')}`;
      }
      const wcrId_res = await db('work_completion_reports').insert({
        billing_record_id: record.id, report_date: reportDate,
        site_name: siteName || 'UAIL Refinery', location: location || 'Doraguda, Rayagada',
        client_name: clientName || 'Bluspring Enterprises Limited',
        work_summary: summary, invoice_reference: invoice?.invoice_number,
        invoice_value: invoice?.invoice_value, amount_in_words: numToWords(Number(invoice?.invoice_value || 0)),
        mode_of_delivery: modeOfDelivery || 'Service at site', documents_enclosed: documentsEnclosed,
      }).returning("id"); const wcrId = typeof wcrId_res[0] === "object" ? (wcrId_res[0] as any).id : wcrId_res[0];
      await db('wcr_signatories').insert([
        { wcr_id: wcrId, role: 'Initiator', sign_order: 1 }, { wcr_id: wcrId, role: 'Verified By', sign_order: 2 },
        { wcr_id: wcrId, role: 'User-Dept Head', sign_order: 3 }, { wcr_id: wcrId, role: 'Stores Incharge', sign_order: 4 },
        { wcr_id: wcrId, role: 'Site Manager', sign_order: 5 }, { wcr_id: wcrId, role: 'Regional Manager', sign_order: 6 },
      ]);
      await db('billing_records').where('id', record.id).update({ status: 'wcr_done', updated_at: db.fn.now() });
      res.status(201).json({ id: wcrId });
    } catch (error) { res.status(500).json({ error: 'Failed to generate WCR' }); }
  });

  return router;
}
