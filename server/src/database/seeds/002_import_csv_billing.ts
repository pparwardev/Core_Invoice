import type { Knex } from 'knex';

/**
 * Import billing/invoice data from CSV records into the database.
 * This seed imports historical billing data for all 3 departments.
 */

interface CsvRecord {
  vendorName: string;
  serviceType: string;
  poNumber: string;
  vendorCode: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceReceiptDate: string;
  basicValue: number;
  gst: number;
  invoiceValue: number;
  monthOfInvoice: string;
  paymentStatus: string;
  deductionAmount: number;
  paidAmount: number;
  utrDetails: string;
  paymentDate: string;
  remarks: string;
  sectionId: number;
}

function parseAmount(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[₹,\s"]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'NA' || cleaned === 'NIL') return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseMonth(monthStr: string): { month: number; year: number } | null {
  if (!monthStr) return null;
  const m = monthStr.trim().toLowerCase();

  // Map month names to numbers
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, octoberber: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  // Try patterns like "Mar'2023", "April'24", "Dec'23", "January'2025", etc.
  const match1 = m.match(/^([a-z]+)['\s]*(\d{2,4})$/);
  if (match1) {
    const monthName = match1[1].replace(/'$/, '');
    const monthNum = monthMap[monthName];
    let yearNum = parseInt(match1[2]);
    if (yearNum < 100) yearNum += 2000;
    if (monthNum) return { month: monthNum, year: yearNum };
  }

  // Try "Month'Year" format
  for (const [key, val] of Object.entries(monthMap)) {
    if (m.startsWith(key)) {
      const yearMatch = m.match(/(\d{2,4})/);
      if (yearMatch) {
        let yr = parseInt(yearMatch[1]);
        if (yr < 100) yr += 2000;
        return { month: val, year: yr };
      }
    }
  }
  return null;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr === 'NA') return null;
  const cleaned = dateStr.trim();
  // Handle MM/DD/YYYY format
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts.map(Number);
    if (y < 100) y += 2000;
    if (m > 0 && m <= 12 && d > 0 && d <= 31 && y > 2000) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

export async function seed(knex: Knex): Promise<void> {
  // Clear existing billing data (keep vendors, POs, sections, users, company)
  await knex('invoice_line_items').del();
  await knex('invoices').del();
  await knex('billing_records').del();

  // Get all vendors for matching
  const vendors = await knex('vendors').select('*');
  const sections = await knex('sections').select('*');
  const purchaseOrders = await knex('purchase_orders').select('*');

  // Helper: find vendor by name (fuzzy match)
  function findVendor(name: string, serviceType: string, sectionId: number) {
    const n = name.trim().toLowerCase();
    // Try exact match first
    let v = vendors.find((v: any) => v.name.toLowerCase() === n);
    if (v) return v;
    // Try partial match
    v = vendors.find((v: any) => n.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(n));
    return v || null;
  }

  // Helper: find or create PO
  async function findOrCreatePO(vendorId: number, poNumber: string, poDate: string | null, validity: string | null, poValue: number, desc: string) {
    if (!poNumber || poNumber === 'NA') return null;
    let po = await knex('purchase_orders').where({ vendor_id: vendorId, po_number: poNumber }).first();
    if (!po) {
      const [id] = await knex('purchase_orders').insert({
        vendor_id: vendorId,
        po_number: poNumber,
        po_date: poDate,
        validity_date: validity,
        po_value: poValue || 0,
        service_description: desc,
      });
      po = { id };
    }
    return po;
  }

  let importedCount = 0;
  let skippedCount = 0;

  // ============ POWER-MMD BILLING DATA (FY 2025-26) ============
  const mmdBilling: CsvRecord[] = [
    // April'2025
    { vendorName: 'Kumari Naik', serviceType: 'House Rent', poNumber: 'IN-KA89952139356185X', vendorCode: '19062976', invoiceNumber: 'NA', invoiceDate: '8/2/2025', invoiceReceiptDate: '8/2/2025', basicValue: 20000, gst: 0, invoiceValue: 20000, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 20000, utrDetails: 'INF/NEFT/ICICN42025081257582372', paymentDate: '8/12/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Ram Murti Naik', serviceType: 'House Rent', poNumber: 'IN-KA89950311656283X', vendorCode: '19063034', invoiceNumber: '', invoiceDate: '8/2/2025', invoiceReceiptDate: '8/2/2025', basicValue: 20000, gst: 0, invoiceValue: 20000, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 20000, utrDetails: 'INF/NEFT/ICICN42025081257582381', paymentDate: '8/12/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Payal Tulo', serviceType: 'House Rent', poNumber: 'IN-KA04439719646771W', vendorCode: '19063174', invoiceNumber: 'NA', invoiceDate: '7/5/2025', invoiceReceiptDate: '7/5/2025', basicValue: 0, gst: 0, invoiceValue: 19250, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 19250, utrDetails: 'YESIG51400015106', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Tripati Prasad Tulo', serviceType: 'House Rent', poNumber: 'IN-KA04451044730858W', vendorCode: '19063176', invoiceNumber: 'NA', invoiceDate: '7/5/2025', invoiceReceiptDate: '7/5/2025', basicValue: 0, gst: 0, invoiceValue: 7700, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 7700, utrDetails: 'YESIG51400012938', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Sabita Sadangi', serviceType: 'House Rent', poNumber: 'IN-KA04442520493586W', vendorCode: '19063175', invoiceNumber: 'NA', invoiceDate: '7/5/2025', invoiceReceiptDate: '7/5/2025', basicValue: 0, gst: 0, invoiceValue: 19950, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 19950, utrDetails: 'YESIG51400015107', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Suraj Kumar Panda', serviceType: 'House Rent', poNumber: 'IN-KA04448439358249W', vendorCode: '19063173', invoiceNumber: 'NA', invoiceDate: '7/5/2025', invoiceReceiptDate: '7/5/2025', basicValue: 0, gst: 0, invoiceValue: 19950, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 19950, utrDetails: 'YESIG51400012937', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    { vendorName: 'SUDAM NAIK (MMD)', serviceType: 'House Rent', poNumber: 'IN-KA04455707707959W', vendorCode: '19050118', invoiceNumber: 'NA', invoiceDate: '7/5/2025', invoiceReceiptDate: '7/5/2025', basicValue: 0, gst: 0, invoiceValue: 20000, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 20000, utrDetails: 'YESIG51400015101', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Pinki Bhatra (MMD)', serviceType: 'Transport - Bus', poNumber: '4200107645', vendorCode: '19053476', invoiceNumber: 'MMD-48', invoiceDate: '5/27/2025', invoiceReceiptDate: '5/27/2025', basicValue: 202728, gst: 36491, invoiceValue: 239219, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 237192, utrDetails: 'YESIG51500097343', paymentDate: '5/30/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Pinki Bhatra (MMD)', serviceType: 'Transport - Bolero', poNumber: '4200107427', vendorCode: '19053476', invoiceNumber: 'MMD-16', invoiceDate: '5/23/2025', invoiceReceiptDate: '5/23/2025', basicValue: 76732, gst: 13812, invoiceValue: 90544, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 89777, utrDetails: 'YESIG51500097343', paymentDate: '5/30/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Lalita Naik (MMD)', serviceType: 'Transport - Camper', poNumber: '4200107644', vendorCode: '19064091', invoiceNumber: '16', invoiceDate: '5/27/2025', invoiceReceiptDate: '5/27/2025', basicValue: 61181, gst: 0, invoiceValue: 61181, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 4000, paidAmount: 60569, utrDetails: 'INF/NEFT/ICICN42025062756893326', paymentDate: '6/27/2025', remarks: '', sectionId: 3 },
    { vendorName: 'HOTEL GANESH', serviceType: 'Food Supply', poNumber: '4200106426', vendorCode: '19063400', invoiceNumber: '831', invoiceDate: '5/8/2025', invoiceReceiptDate: '5/8/2025', basicValue: 0, gst: 0, invoiceValue: 53580, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 53580, utrDetails: 'YESIG51400012919', paymentDate: '5/19/2025', remarks: '', sectionId: 3 },
    // May'2025
    { vendorName: 'Pinki Bhatra (MMD)', serviceType: 'Transport - Bus', poNumber: '4200107645', vendorCode: '19053476', invoiceNumber: 'MMD-51', invoiceDate: '6/11/2025', invoiceReceiptDate: '6/11/2025', basicValue: 206996, gst: 37259, invoiceValue: 244255, monthOfInvoice: "May'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 242185, utrDetails: 'INF/NEFT/ICICN42025062052154173', paymentDate: '6/20/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Pinki Bhatra (MMD)', serviceType: 'Transport - Bolero', poNumber: '4200107427', vendorCode: '19053476', invoiceNumber: 'MMD-52', invoiceDate: '6/11/2025', invoiceReceiptDate: '6/11/2025', basicValue: 81415, gst: 14655, invoiceValue: 96070, monthOfInvoice: "May'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 95256, utrDetails: 'INF/NEFT/ICICN42025062052154173', paymentDate: '6/20/2025', remarks: '', sectionId: 3 },
    { vendorName: 'Lalita Naik (MMD)', serviceType: 'Transport - Camper', poNumber: '4200107644', vendorCode: '19064091', invoiceNumber: '17', invoiceDate: '6/6/2025', invoiceReceiptDate: '6/6/2025', basicValue: 64165, gst: 0, invoiceValue: 64165, monthOfInvoice: "May'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 63523, utrDetails: 'INF/NEFT/ICICN42025072559976612', paymentDate: '7/25/2025', remarks: '', sectionId: 3 },
    { vendorName: 'HOTEL GANESH', serviceType: 'Food Supply', poNumber: '4200106862', vendorCode: '19063400', invoiceNumber: '653', invoiceDate: '6/10/2025', invoiceReceiptDate: '6/10/2025', basicValue: 68340, gst: 0, invoiceValue: 68340, monthOfInvoice: "May'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 68340, utrDetails: 'INF/NEFT/ICICN42025070451861773', paymentDate: '7/4/2025', remarks: '', sectionId: 3 },
  ];

  // ============ POWER-ENGINEERING BILLING DATA (FY 2025-26) ============
  const pesBilling: CsvRecord[] = [
    // April'2025
    { vendorName: 'A K Engineering Works', serviceType: 'Hydra Service', poNumber: '4200106720', vendorCode: '1000946', invoiceNumber: 'AKE/B/25-26/5', invoiceDate: '5/19/2025', invoiceReceiptDate: '5/19/2025', basicValue: 204756, gst: 36856, invoiceValue: 241612, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 239565, utrDetails: 'INF/NEFT/ICICN42025061851398623', paymentDate: '6/18/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Bhusan Bhatra', serviceType: 'Bob Cat Service', poNumber: '4200109010', vendorCode: '19054034', invoiceNumber: 'MMD-30', invoiceDate: '6/18/2025', invoiceReceiptDate: '6/18/2025', basicValue: 199447, gst: 35900, invoiceValue: 235347, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 233353, utrDetails: 'INF/NEFT/ICICN42025070451862414', paymentDate: '7/4/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Ramesh Naik', serviceType: 'Transport - Bolero', poNumber: '4200107391', vendorCode: '19054279', invoiceNumber: '30', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 52934, gst: 0, invoiceValue: 52934, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 52405, utrDetails: 'ICICN42025061357745615', paymentDate: '6/13/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Navi Naik', serviceType: 'Transport - Bolero', poNumber: '4200107392', vendorCode: '19054278', invoiceNumber: '30', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 57350, gst: 0, invoiceValue: 57350, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 56776, utrDetails: 'ICICN42025061357745607', paymentDate: '6/13/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Saranjula Naik', serviceType: 'Transport - Bus', poNumber: '4200107390', vendorCode: '19054020', invoiceNumber: '05(2025-2026)', invoiceDate: '5/22/2025', invoiceReceiptDate: '5/22/2025', basicValue: 169835, gst: 30570, invoiceValue: 200405, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 198708, utrDetails: 'ICICN42025061750866434', paymentDate: '6/17/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Prusty Duria', serviceType: 'Transport - Camper', poNumber: '4200106868', vendorCode: '19054277', invoiceNumber: '30', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 55730, gst: 0, invoiceValue: 55730, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 55173, utrDetails: 'ICICN42025061357745600', paymentDate: '6/13/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Roshan Construction Company', serviceType: 'Dozzer Service', poNumber: '4200106866', vendorCode: '19054226', invoiceNumber: 'RCC/BEL/25-26/01', invoiceDate: '6/4/2025', invoiceReceiptDate: '6/4/2025', basicValue: 340470, gst: 61285, invoiceValue: 401755, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 394946, utrDetails: 'INF/NEFT/ICICN42025062052367311', paymentDate: '6/20/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Namita Pujari', serviceType: 'House Rent', poNumber: 'IN-KA89959370594547X', vendorCode: '19060642', invoiceNumber: '', invoiceDate: '8/2/2025', invoiceReceiptDate: '8/2/2025', basicValue: 60000, gst: 0, invoiceValue: 60000, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 54000, utrDetails: 'INF/NEFT/ICICN42025081257582228', paymentDate: '8/12/2025', remarks: '', sectionId: 2 },
    { vendorName: 'RABI CHANDRA SAHU', serviceType: 'Guest House Rent', poNumber: 'IN-KA04428626971855W', vendorCode: '19053898', invoiceNumber: 'NA', invoiceDate: '5/5/2025', invoiceReceiptDate: '5/5/2025', basicValue: 0, gst: 0, invoiceValue: 26666, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 26666, utrDetails: 'YESIG51400015103', paymentDate: '5/19/2025', remarks: '', sectionId: 2 },
    { vendorName: 'BALMIKI SAHU', serviceType: 'House Rent', poNumber: 'IN-KA69578929292953X', vendorCode: '19053874', invoiceNumber: 'NA', invoiceDate: '5/5/2025', invoiceReceiptDate: '5/5/2025', basicValue: 0, gst: 0, invoiceValue: 26666, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 26666, utrDetails: 'YESIG51400012934', paymentDate: '5/19/2025', remarks: '', sectionId: 2 },
    { vendorName: 'RANJITA SAHU', serviceType: 'Guest House Electricity', poNumber: 'IN-KA69572289956299X', vendorCode: '19053857', invoiceNumber: 'NA', invoiceDate: '5/5/2025', invoiceReceiptDate: '5/5/2025', basicValue: 0, gst: 0, invoiceValue: 26666, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 26666, utrDetails: 'YESIG51400015102', paymentDate: '5/19/2025', remarks: '', sectionId: 2 },
    { vendorName: 'MEENAKSHI SAHU', serviceType: 'House Rent', poNumber: 'IN-KA04435947392477W', vendorCode: '19063674', invoiceNumber: 'NA', invoiceDate: '5/5/2025', invoiceReceiptDate: '5/5/2025', basicValue: 0, gst: 0, invoiceValue: 10000, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 10000, utrDetails: 'YESIG51400012923', paymentDate: '5/19/2025', remarks: '', sectionId: 2 },
    { vendorName: 'Michael Benia', serviceType: 'Tipper Service', poNumber: '4200106867', vendorCode: '19054276', invoiceNumber: '6', invoiceDate: '6/7/2025', invoiceReceiptDate: '6/7/2025', basicValue: 47083, gst: 0, invoiceValue: 47083, monthOfInvoice: "April'2025", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 46612, utrDetails: 'INF/NEFT/ICICN42025062756894169', paymentDate: '6/27/2025', remarks: '', sectionId: 2 },
  ];

  // ============ REFINERY BILLING DATA (FY 2025-26) ============
  const refineryBilling: CsvRecord[] = [
    // April'2025
    { vendorName: 'M/s. Lalita Naik', serviceType: 'House Keeping', poNumber: '4200106714', vendorCode: '1000685', invoiceNumber: 'LN/QS-21/25-26', invoiceDate: '5/14/2025', invoiceReceiptDate: '5/14/2025', basicValue: 304380, gst: 54788, invoiceValue: 359168, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 1143839, utrDetails: 'YESIG51400017404', paymentDate: '5/19/2025', remarks: 'Electrical', sectionId: 1 },
    { vendorName: 'M/s. Lalita Naik', serviceType: 'House Keeping', poNumber: '4200106713', vendorCode: '1000685', invoiceNumber: 'LN/QS-23/25-26', invoiceDate: '5/14/2025', invoiceReceiptDate: '5/14/2025', basicValue: 372300, gst: 67014, invoiceValue: 439314, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 0, utrDetails: '', paymentDate: '', remarks: 'Mechanical', sectionId: 1 },
    { vendorName: 'M/s. Lalita Naik', serviceType: 'House Keeping', poNumber: '4200106713', vendorCode: '1000685', invoiceNumber: 'LN/QS-22/25-26', invoiceDate: '5/14/2025', invoiceReceiptDate: '5/14/2025', basicValue: 300960, gst: 54173, invoiceValue: 355133, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 0, utrDetails: '', paymentDate: '', remarks: 'Instrumentation', sectionId: 1 },
    { vendorName: 'SUSHANTA NAG', serviceType: 'Transport - Camper', poNumber: '4200107426', vendorCode: '19054330', invoiceNumber: '43', invoiceDate: '5/27/2025', invoiceReceiptDate: '5/27/2025', basicValue: 86224, gst: 0, invoiceValue: 86224, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 85361, utrDetails: 'ICICN42025061357745621', paymentDate: '6/13/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Pinki Bhatra', serviceType: 'Transport - Camper', poNumber: '4200107643', vendorCode: '19053476', invoiceNumber: 'MMD-49', invoiceDate: '5/27/2025', invoiceReceiptDate: '5/27/2025', basicValue: 69266, gst: 12468, invoiceValue: 81734, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 81041, utrDetails: 'YESIG51500097342', paymentDate: '5/30/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Lalbahadur Naik', serviceType: 'Transport - Bus', poNumber: '4200107639', vendorCode: '1000384', invoiceNumber: '71', invoiceDate: '6/2/2025', invoiceReceiptDate: '6/2/2025', basicValue: 160395, gst: 0, invoiceValue: 160395, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 158791, utrDetails: 'INF/NEFT/ICICN42025062052154171', paymentDate: '6/20/2025', remarks: 'Bus-7029', sectionId: 1 },
    { vendorName: 'Lalbahadur Naik', serviceType: 'Transport - Bus', poNumber: '4200107641', vendorCode: '1000384', invoiceNumber: '50', invoiceDate: '6/2/2025', invoiceReceiptDate: '6/2/2025', basicValue: 153566, gst: 0, invoiceValue: 153566, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 152030, utrDetails: 'INF/NEFT/ICICN42025062052154171', paymentDate: '6/20/2025', remarks: 'Bus-0575', sectionId: 1 },
    { vendorName: 'Bidyadhar Nayak', serviceType: 'Transport - Bus', poNumber: '4200107860', vendorCode: '1000288', invoiceNumber: '149/BUS', invoiceDate: '6/2/2025', invoiceReceiptDate: '6/2/2025', basicValue: 149526, gst: 0, invoiceValue: 149526, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 148031, utrDetails: 'INF/NEFT/ICICN42025062052153939', paymentDate: '6/20/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Sukanta Bagh', serviceType: 'Transport - Camper', poNumber: '4200107640', vendorCode: '1000840', invoiceNumber: '121', invoiceDate: '6/2/2025', invoiceReceiptDate: '6/2/2025', basicValue: 84000, gst: 0, invoiceValue: 84000, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 83160, utrDetails: 'INF/NEFT/ICICN42025062052153950', paymentDate: '6/20/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Renuka Naik', serviceType: 'Transport - Bolero', poNumber: '4200107424', vendorCode: '19048958', invoiceNumber: '45', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 66610, gst: 0, invoiceValue: 66610, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 65944, utrDetails: 'YESIG51570196845', paymentDate: '6/6/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Nazarene Travels', serviceType: 'Transport - Bolero', poNumber: '4200107425', vendorCode: '1000665', invoiceNumber: '238', invoiceDate: '5/30/2025', invoiceReceiptDate: '5/30/2025', basicValue: 72974, gst: 0, invoiceValue: 72974, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 72244, utrDetails: 'YESIG51950100419', paymentDate: '7/14/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Nazarene Travels', serviceType: 'Transport - Bus', poNumber: '4200107642', vendorCode: '1000665', invoiceNumber: '237', invoiceDate: '5/30/2025', invoiceReceiptDate: '5/30/2025', basicValue: 134873, gst: 0, invoiceValue: 134873, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 133524, utrDetails: 'INF/NEFT/ICICN42025070451862125', paymentDate: '7/4/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Nazarene Travels', serviceType: 'Transport - Palfinger', poNumber: '4200106874', vendorCode: '1000665', invoiceNumber: '236', invoiceDate: '5/22/2025', invoiceReceiptDate: '5/22/2025', basicValue: 274709, gst: 49448, invoiceValue: 324156, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 321410, utrDetails: 'INF/NEFT/ICICN42025062656387758', paymentDate: '6/26/2025', remarks: 'Palfinger-7399', sectionId: 1 },
    { vendorName: 'Nazarene Travels', serviceType: 'Transport - Palfinger', poNumber: '4200106874', vendorCode: '1000665', invoiceNumber: '235', invoiceDate: '5/22/2025', invoiceReceiptDate: '5/22/2025', basicValue: 275776, gst: 49640, invoiceValue: 325416, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 322658, utrDetails: 'INF/NEFT/ICICN42025062656387758', paymentDate: '6/26/2025', remarks: 'Palfinger-7186', sectionId: 1 },
    { vendorName: 'Sabala Naik', serviceType: 'Hydra Service', poNumber: '4200106872', vendorCode: '1000885', invoiceNumber: '28', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 205450, gst: 36981, invoiceValue: 242431, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 240377, utrDetails: 'INF/NEFT/ICICN42025062052154179', paymentDate: '6/20/2025', remarks: '', sectionId: 1 },
    { vendorName: 'AK Engineering', serviceType: 'Forklift Service', poNumber: '4200106873', vendorCode: '1000946', invoiceNumber: 'AKE/B/25-26/02', invoiceDate: '5/19/2025', invoiceReceiptDate: '5/19/2025', basicValue: 102976, gst: 18536, invoiceValue: 121512, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 120482, utrDetails: 'INF/NEFT/ICICN42025061851398616', paymentDate: '6/18/2025', remarks: '', sectionId: 1 },
    { vendorName: 'AK Engineering', serviceType: 'Hydra Service', poNumber: '4200106873', vendorCode: '1000946', invoiceNumber: 'AKE/B/25-26/03', invoiceDate: '5/19/2025', invoiceReceiptDate: '5/19/2025', basicValue: 223428, gst: 40217, invoiceValue: 263645, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 261411, utrDetails: 'INF/NEFT/ICICN42025061851398616', paymentDate: '6/18/2025', remarks: '', sectionId: 1 },
    { vendorName: 'AK Engineering', serviceType: 'Trailor Service', poNumber: '4200106873', vendorCode: '1000946', invoiceNumber: 'AKE/B/25-26/04', invoiceDate: '5/19/2025', invoiceReceiptDate: '5/19/2025', basicValue: 156883, gst: 28239, invoiceValue: 185122, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 183553, utrDetails: 'INF/NEFT/ICICN42025061851398616', paymentDate: '6/18/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Logistic Enterprises', serviceType: 'Crane Service', poNumber: '4200106871', vendorCode: '1001685', invoiceNumber: 'SB2505041/2526', invoiceDate: '5/21/2025', invoiceReceiptDate: '5/21/2025', basicValue: 347032, gst: 62466, invoiceValue: 409497, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 402557, utrDetails: 'INF/NEFT/ICICN42025062052366829', paymentDate: '6/20/2025', remarks: '40T', sectionId: 1 },
    { vendorName: 'Logistic Enterprises', serviceType: 'Crane Service', poNumber: '4200106870', vendorCode: '1001685', invoiceNumber: 'SB2505040/2526', invoiceDate: '5/21/2025', invoiceReceiptDate: '5/21/2025', basicValue: 805493, gst: 144989, invoiceValue: 950482, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 934372, utrDetails: 'INF/NEFT/ICICN42025062052366829', paymentDate: '6/20/2025', remarks: '200T', sectionId: 1 },
    { vendorName: 'Paramanand Naik', serviceType: 'Transport - Palfinger', poNumber: '4200106721', vendorCode: '19050482', invoiceNumber: '40', invoiceDate: '5/24/2025', invoiceReceiptDate: '5/24/2025', basicValue: 283877, gst: 51098, invoiceValue: 334975, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 332136, utrDetails: 'ICICN42025061750866421', paymentDate: '6/17/2025', remarks: '', sectionId: 1 },
    { vendorName: 'PBL Transport', serviceType: 'Crane Service', poNumber: '4200106869', vendorCode: '1000057', invoiceNumber: '26/INV/100133', invoiceDate: '5/21/2025', invoiceReceiptDate: '5/21/2025', basicValue: 630949, gst: 113571, invoiceValue: 744520, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 731901, utrDetails: 'INF/NEFT/ICICN42025062052367179', paymentDate: '6/20/2025', remarks: '100T', sectionId: 1 },
    { vendorName: 'Pabitra Naik', serviceType: 'Pipeline Service', poNumber: '4200106214', vendorCode: '1001945', invoiceNumber: '85', invoiceDate: '5/8/2024', invoiceReceiptDate: '5/8/2024', basicValue: 18900, gst: 0, invoiceValue: 18900, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 18711, utrDetails: 'ICICN42025061357745462', paymentDate: '6/13/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Ganeswar Hospitality Service', serviceType: 'Food Supply', poNumber: '4200109720', vendorCode: '1001369', invoiceNumber: 'APR/BLS/2025-26/001', invoiceDate: '7/21/2025', invoiceReceiptDate: '7/21/2025', basicValue: 53865, gst: 0, invoiceValue: 53865, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 53865, utrDetails: 'INF/NEFT/ICICN42025081156641761', paymentDate: '8/11/2025', remarks: '', sectionId: 1 },
    { vendorName: 'Ruchi Hotel', serviceType: 'Food Supply', poNumber: '4200109911', vendorCode: '19068884', invoiceNumber: '33-R', invoiceDate: '7/8/2025', invoiceReceiptDate: '7/8/2025', basicValue: 59150, gst: 0, invoiceValue: 59150, monthOfInvoice: "April'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 59150, utrDetails: 'INF/INFT/041038113881', paymentDate: '7/25/2025', remarks: '', sectionId: 1 },
    { vendorName: 'MAINTWIZ', serviceType: 'CMMS Service', poNumber: '4200106213', vendorCode: '1001213', invoiceNumber: 'MAINTWIZBEL5019', invoiceDate: '5/8/2025', invoiceReceiptDate: '5/8/2025', basicValue: 82500, gst: 14850, invoiceValue: 97350, monthOfInvoice: "May-July'25", paymentStatus: 'Done', deductionAmount: 0, paidAmount: 97350, utrDetails: '', paymentDate: '', remarks: '', sectionId: 1 },
  ];

  // ============ PROCESS ALL BILLING RECORDS ============
  const allBilling = [...mmdBilling, ...pesBilling, ...refineryBilling];

  for (const record of allBilling) {
    const vendor = findVendor(record.vendorName, record.serviceType, record.sectionId);
    if (!vendor) {
      skippedCount++;
      continue;
    }

    const period = parseMonth(record.monthOfInvoice);
    if (!period) {
      skippedCount++;
      continue;
    }

    // Find or create PO
    const po = await findOrCreatePO(
      vendor.id,
      record.poNumber,
      parseDate(record.invoiceDate),
      null,
      0,
      record.serviceType
    );

    // Determine payment status
    let paymentStatus = 'pending';
    if (record.paymentStatus.toLowerCase() === 'done') paymentStatus = 'paid';
    else if (record.paidAmount > 0) paymentStatus = 'partial';

    // Create billing record
    const [billingId] = await knex('billing_records').insert({
      vendor_id: vendor.id,
      purchase_order_id: po?.id || null,
      section_id: record.sectionId,
      billing_period_month: period.month,
      billing_period_year: period.year,
      status: 'finalized',
      payment_status: paymentStatus,
      deduction_amount: record.deductionAmount,
      paid_amount: record.paidAmount || null,
      utr_details: record.utrDetails || null,
      payment_date: parseDate(record.paymentDate) || null,
      remarks: record.remarks || null,
      finalized: true,
    });

    // Create invoice
    if (record.invoiceValue > 0) {
      await knex('invoices').insert({
        billing_record_id: billingId,
        invoice_number: record.invoiceNumber || `AUTO-${billingId}`,
        invoice_date: parseDate(record.invoiceDate) || null,
        invoice_receipt_date: parseDate(record.invoiceReceiptDate) || null,
        nature: 'Original',
        basic_value: record.basicValue,
        gst_percentage: record.basicValue > 0 && record.gst > 0 ? ((record.gst / record.basicValue) * 100) : (record.gst > 0 ? 18 : 0),
        gst_amount: record.gst,
        invoice_value: record.invoiceValue,
      });
    }

    importedCount++;
  }

  console.log(`✅ Billing import complete: ${importedCount} records imported, ${skippedCount} skipped`);
}
