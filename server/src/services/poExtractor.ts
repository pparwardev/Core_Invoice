/**
 * PO PDF Extractor — Node.js port of mcp-server/extract_po.py
 * Extracts billing-relevant data from Purchase Order PDFs using pdf-parse.
 * Falls back to Python script if available for better accuracy.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try Python first (more accurate with pdfplumber), fallback to Node.js
export async function extractPoData(filePath: string): Promise<any> {
  // Try Python extraction first
  const pythonResult = await tryPythonExtraction(filePath);

  // If Python returned a result, check if it actually extracted useful data
  if (pythonResult) {
    const hasUsefulData = pythonResult.purchaseOrderNumber ||
      pythonResult.supplierName ||
      pythonResult.totalAmount > 0 ||
      (pythonResult.lineItems && pythonResult.lineItems.length > 0);

    if (hasUsefulData) return pythonResult;
  }

  // Fallback to Node.js extraction (handles POs + Lease Agreements + Contracts)
  return await nodeExtraction(filePath);
}

async function tryPythonExtraction(filePath: string): Promise<any | null> {
  // Check multiple possible Python paths
  const possiblePythonPaths = [
    path.resolve(__dirname, '../../../mcp-server/.venv/bin/python3'),
    path.resolve(__dirname, '../../../mcp-server/.venv/bin/python'),
    path.resolve(__dirname, '../../../mcp-server/.venv/Scripts/python.exe'), // Windows venv
    'python3',
    'python',
  ];

  const extractScript = path.resolve(__dirname, '../../../mcp-server/extract_po.py');

  // Check if script exists
  if (!fs.existsSync(extractScript)) {
    // Try relative to server in packaged app
    const packagedScript = path.resolve(__dirname, '../../mcp-server/extract_po.py');
    if (!fs.existsSync(packagedScript)) return null;
  }

  const scriptPath = fs.existsSync(extractScript)
    ? extractScript
    : path.resolve(__dirname, '../../mcp-server/extract_po.py');

  for (const pythonPath of possiblePythonPaths) {
    try {
      const { stdout } = await execFileAsync(pythonPath, [scriptPath, filePath], {
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
      });
      if (stdout) {
        const result = JSON.parse(stdout);
        if (!result.error) return result;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function nodeExtraction(filePath: string): Promise<any> {
  // Use createRequire for pdf-parse v1.1.1 (CJS module)
  let pdfParse: any;
  try {
    pdfParse = require('pdf-parse');
  } catch (err: any) {
    return { error: 'pdf-parse module not available: ' + err.message };
  }

  if (typeof pdfParse !== 'function') {
    return { error: 'pdf-parse is not a function. Check package version (need v1.1.1).' };
  }

  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  const text = pdfData.text;

  if (!text || text.trim().length < 50) {
    return { error: 'No text extracted. PDF may be scanned/image-based. Install Python + pdfplumber for better results.' };
  }

  // Detect document type
  const isLeaseAgreement = /lease\s*agreement|rent\s*agreement|lessor|lessee/i.test(text);
  const isContract = /agreement|contract|between.*and/i.test(text) && !/purchase\s*order/i.test(text);
  const isPurchaseOrder = /purchase\s*order|PO\s*No|PO\s*Number|\d{10}\s+\d{2}\/\d{2}\/\d{4}/i.test(text);

  // If it's a lease/contract (not a PO), use generic extraction
  if ((isLeaseAgreement || isContract) && !isPurchaseOrder) {
    return extractGenericDocument(text, filePath);
  }

  // Extract using regex patterns (same logic as Python version)
  const GSTIN_PATTERN = /\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[A-Z\d]{1}[A-Z\d]{1}/g;
  const PAN_PATTERN = /[A-Z]{5}\d{4}[A-Z]{1}/g;
  const MSME_PATTERN = /(UDYAM-[A-Z]{2}-\d{2}-\d{7})/g;

  const gstins = text.match(GSTIN_PATTERN) || [];
  const pans = text.match(PAN_PATTERN) || [];
  const msme = text.match(MSME_PATTERN) || [];

  // PO Number
  let poNumber = '';
  const poMatch = text.match(/(\d{10})\s+\d{2}\/\d{2}\/\d{4}/);
  if (poMatch) poNumber = poMatch[1];
  if (!poNumber) {
    const poMatch2 = text.match(/(?:Purchase\s*Order|PO)\s*(?:No|Number|#)?[:\s]*([A-Z0-9\-\/]+\d+)/i);
    if (poMatch2) poNumber = poMatch2[1];
  }

  // Order Date
  let orderDate = '';
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (dateMatch) orderDate = dateMatch[1];

  // Vendor/Supplier Name
  let supplierName = '';
  const supMatch = text.match(/(?:Supplier|Vendor)\s*(?:Name)?[:\s]*([^\n]+)/i);
  if (supMatch) supplierName = (supMatch[1] || '').trim();
  if (!supplierName) {
    const msMatch = text.match(/(?:M\/s\.?|Messrs\.?)\s*([^\n,]+)/i);
    if (msMatch) supplierName = (msMatch[1] || '').trim();
  }

  // Service dates
  const serviceStart = extractField(text, /Service Start Date[:\s]*(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})/i);
  const serviceEnd = extractField(text, /Service End Date[:\s]*(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})/i);
  const contractMatch = text.match(/Contract Period.*?(\d{2}\.\d{2}\.\d{4})\s*to\s*(\d{2}\.\d{2}\.\d{4})/i);

  // Amounts
  const baseValue = parseAmount(extractField(text, /(?:Basic Value|Base Value)[:\s]*([\d,]+\.?\d*)/i));
  const totalAmount = parseAmount(extractField(text, /(?:Total Amount|Grand Total)[:\s]*([\d,]+\.?\d*)/i));
  const cgstTotal = parseAmount(extractField(text, /CGST[:\s]*([\d,]+\.?\d*)/i));
  const sgstTotal = parseAmount(extractField(text, /SGST[:\s]*([\d,]+\.?\d*)/i));

  // Payment terms
  const paymentTerms = extractField(text, /Payment Terms?[:\s]*([^\n]+)/i);

  // Contact
  const contactPerson = extractField(text, /Contact Person[:\s]*([^\n]+)/i);
  const contactNumber = extractField(text, /Contact number[:\s]*([^\n]+)/i);
  const emailId = extractField(text, /Email Id[:\s]*([^\n]+)/i);

  // Invoice requirements
  const invoiceReq = extractField(text, /Invoice Documentation Requirements[:\s]*\n((?:\d+\s+.+\n?)+)/i);

  // Amount in words
  const amountInWords = extractField(text, /Amount Chargable \(In Words\)[:\s]*([^\n]+)/i);

  // WBS
  const wbsId = extractField(text, /WBS ID[:\s]*([^\n]+)/i);

  // ERP numbers
  const erpPrNumber = extractField(text, /(PRSR\d+)/);
  const erpPoNumber = extractField(text, /(POSR\d+)/);

  // Supplier code
  const supplierCode = extractField(text, /Supplier Code[:\s]*(\d{10})/i);

  // Bill To
  const billToName = extractField(text, /Name and Address of Purchaser.*?\n([^\n]+)/i) || 'Bluspring Enterprises Limited';

  const result = {
    purchaseOrderNumber: poNumber,
    orderDate,
    billToName,
    billToAddress: '',
    purchaserGstin: gstins[0] || '',
    shipToAddress: '',
    supplierName,
    supplierCode,
    supplierAddress: '',
    vendorGstin: gstins.length > 1 ? gstins[1] : '',
    vendorPan: pans.length > 1 ? pans[1] : (pans[0] || ''),
    msmeNumber: msme[0] || '',
    contactPerson,
    contactNumber,
    emailId,
    serviceStartDate: serviceStart || (contractMatch ? contractMatch[1] : ''),
    serviceEndDate: serviceEnd || (contractMatch ? contractMatch[2] : ''),
    erpPrNumber,
    erpPrType: text.includes('Service') ? 'Service' : '',
    erpPoNumber,
    wbsId,
    paymentTerms,
    requestedType: text.includes('Billable') ? 'Billable' : '',
    expectedDelivery: '',
    lineItems: [],
    hireItems: [],
    dieselItems: [],
    baseValue,
    cgstTotal,
    sgstTotal,
    totalAmount: totalAmount || (baseValue + cgstTotal + sgstTotal),
    advancePayable: '',
    amountInWords,
    invoiceRequirements: invoiceReq,
    dieselTerms: '',
    dieselRate: 0,
    scopeOfWork: '',
    serviceCategory: 'other',
    gstStatus: gstins.length > 1 ? 'registered' : 'unknown',
    gstType: 'CGST_SGST',
    gstRate: 18,
    maxPoQty: 0,
    maxPoValue: baseValue || totalAmount,
    maxDieselQty: 0,
    autoFetchable: {
      poNumber,
      vendorName: supplierName,
      vendorGstin: gstins.length > 1 ? gstins[1] : '',
      vendorPan: pans.length > 1 ? pans[1] : '',
      msmeNumber: msme[0] || '',
      supplierCode,
    },
    manualRequired: [
      { field: 'invoiceNumber', label: 'Invoice Number', reason: 'Vendor generates at billing' },
      { field: 'invoiceDate', label: 'Invoice Date', reason: 'Date of bill raising' },
      { field: 'billingPeriod', label: 'Billing Period (From-To)', reason: 'Specific month billed' },
    ],
    _extractionMethod: 'node-pdf-parse',
  };

  return result;
}

function extractField(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match && match[1] ? match[1].trim() : '';
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[₹,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Generic document extraction for Lease Agreements, Contracts, etc.
 * Extracts parties, dates, amounts, PAN, addresses from any document.
 */
function extractGenericDocument(text: string, filePath: string): any {
  const PAN_PATTERN = /[A-Z]{5}\d{4}[A-Z]{1}/g;
  const GSTIN_PATTERN = /\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[A-Z\d]{1}[A-Z\d]{1}/g;

  const pans = text.match(PAN_PATTERN) || [];
  const gstins = text.match(GSTIN_PATTERN) || [];

  // Document type detection
  const isLease = /lease\s*agreement|rent\s*agreement/i.test(text);
  const docType = isLease ? 'Lease Agreement' : 'Contract/Agreement';

  // Extract parties — In lease agreements, Second Party = Vendor (Lessor)
  let firstParty = '';
  let secondParty = '';

  // Second Party is the vendor/lessor (the person giving property on rent)
  const secondPartyMatch = text.match(/Second\s*Party\s*[:\s]+([A-Z][A-Za-z\s.]+)/i)
    || text.match(/Second\s*Party\s*[:\s]+([^\n,]+)/i);
  if (secondPartyMatch) firstParty = (secondPartyMatch[1] || '').trim().replace(/\s*S\/o.*/, '').replace(/\s*aged.*/, '').replace(/\s*W\/o.*/, '').replace(/\s*D\/o.*/, '').replace(/\s*bearing.*/, '');

  // If not found via "Second Party", try Lessor pattern
  if (!firstParty) {
    const lessorMatch = text.match(/(?:LESSOR|Landlord)\s*[:\s]+([^\n,]+)/i);
    if (lessorMatch) firstParty = (lessorMatch[1] || '').trim().replace(/\s*S\/o.*/, '').replace(/\s*aged.*/, '');
  }

  // Try "By and Between" pattern — first name after it is the vendor
  if (!firstParty) {
    const betweenMatch = text.match(/By and Between[:\s]*\n\s*([^\n]+)/i);
    if (betweenMatch) firstParty = (betweenMatch[1] || '').trim().replace(/\s*S\/o.*/, '').replace(/\s*aged.*/, '').replace(/\s*W\/o.*/, '');
  }

  // First Party / Lessee is the company (Quess/Bluspring)
  const firstPartyCompany = text.match(/First\s*Party\s*[:\s]+([^\n,]+)/i);
  if (firstPartyCompany) secondParty = (firstPartyCompany[1] || '').trim();
  if (!secondParty) {
    const lesseeMatch = text.match(/(QUESS CORP LIMITED|Bluspring Enterprises Limited)/i);
    if (lesseeMatch) secondParty = (lesseeMatch[1] || '').trim();
  }

  // Certificate/Reference number
  const certNo = extractField(text, /Certificate No[.\s:]*([^\n]+)/i)
    || extractField(text, /Unique Doc[.\s]*Reference[:\s]*([^\n]+)/i)
    || extractField(text, /Agreement No[.\s:]*([^\n]+)/i);

  // Dates
  const allDates = text.match(/\d{2}[.\/\-]\d{2}[.\/\-]\d{4}/g) || [];
  let startDate = '';
  let endDate = '';

  // Look for specific date patterns
  const commencementMatch = text.match(/(?:Commencement Date|with effect from|from the date of)[^0-9]*(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})/i);
  if (commencementMatch) startDate = commencementMatch[1];

  const endMatch = text.match(/(?:till|until|expiry|end date|valid till)[^0-9]*(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})/i);
  if (endMatch) endDate = endMatch[1];

  // Fallback: first and last dates in document
  if (!startDate && allDates.length > 0) startDate = allDates[0] || '';
  if (!endDate && allDates.length > 1) endDate = allDates[allDates.length - 1] || '';

  // Term/Duration
  const termMatch = text.match(/(?:period of|term of|tenure of)\s*(\d+)\s*(months?|years?)/i);
  const term = termMatch ? `${termMatch[1]} ${termMatch[2]}` : '';

  // Monthly rent/amount
  let monthlyAmount = 0;
  const rentMatch = text.match(/(?:monthly rent|rent)[^₹Rs.0-9]*(?:Rs\.?|₹)\s*([\d,]+)/i)
    || text.match(/sum of Rs[.\s]*([\d,]+)/i)
    || text.match(/(?:Rs\.?|₹)\s*([\d,]+)\s*\/?\s*-?\s*\(/i);
  if (rentMatch) monthlyAmount = parseAmount(rentMatch[1]);

  // Total/Consideration amount
  let totalAmount = 0;
  const considerationMatch = text.match(/Consideration Price[^0-9]*([\d,]+)/i)
    || text.match(/(?:total|aggregate|consideration)[^₹Rs.0-9]*(?:Rs\.?|₹)\s*([\d,]+)/i);
  if (considerationMatch) totalAmount = parseAmount(considerationMatch[1]);
  if (!totalAmount && monthlyAmount && termMatch) {
    const months = termMatch[2].toLowerCase().includes('year') ? Number(termMatch[1]) * 12 : Number(termMatch[1]);
    totalAmount = monthlyAmount * months;
  }

  // Address
  const addressMatch = text.match(/(?:situated|located|premises)[^,]*,\s*([^,]+(?:,\s*[^,]+){1,4})/i)
    || text.match(/(?:Odisha|Karnataka|Maharashtra|Tamil Nadu)[^–-]*[–-]\s*(\d{6})/i);
  const propertyAddress = addressMatch ? (addressMatch[0] || '').trim().substring(0, 200) : '';

  // Property description
  const propertyDesc = extractField(text, /Property Description[:\s]*([^\n]+)/i)
    || extractField(text, /admeasuring[^.]*\./i);

  // PAN of vendor/lessor
  const vendorPan = pans.length > 0 ? pans[0] : '';

  // Build result in same format as PO extraction
  const result = {
    purchaseOrderNumber: certNo || `${docType.substring(0, 5).toUpperCase()}-${startDate?.replace(/[.\/]/g, '') || 'UNKNOWN'}`,
    orderDate: startDate || allDates[0] || '',
    billToName: secondParty || 'Bluspring Enterprises Limited',
    billToAddress: '',
    purchaserGstin: gstins[0] || '',
    shipToAddress: propertyAddress,
    supplierName: firstParty,
    supplierCode: '',
    supplierAddress: propertyAddress,
    vendorGstin: gstins.length > 1 ? gstins[1] : '',
    vendorPan,
    msmeNumber: '',
    contactPerson: firstParty,
    contactNumber: extractField(text, /(?:phone|mobile|contact)[:\s]*([+\d\s\-]+)/i),
    emailId: extractField(text, /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/),
    serviceStartDate: startDate,
    serviceEndDate: endDate,
    erpPrNumber: '',
    erpPrType: docType,
    erpPoNumber: '',
    wbsId: '',
    paymentTerms: monthlyAmount ? `₹${monthlyAmount.toLocaleString('en-IN')}/month` : '',
    requestedType: docType,
    expectedDelivery: endDate,
    lineItems: [{
      sn: 1,
      hsnSac: isLease ? '997212' : '',
      itemCode: '',
      itemDescription: docType + (propertyDesc ? ` — ${propertyDesc}` : ''),
      uom: 'Month',
      quantity: termMatch ? Number(termMatch[1]) : 12,
      unitRate: monthlyAmount,
      amount: totalAmount || monthlyAmount * 12,
    }],
    hireItems: [],
    dieselItems: [],
    baseValue: totalAmount || monthlyAmount * 12,
    cgstTotal: 0,
    sgstTotal: 0,
    totalAmount: totalAmount || monthlyAmount * 12,
    advancePayable: '',
    amountInWords: '',
    invoiceRequirements: '',
    dieselTerms: '',
    dieselRate: 0,
    scopeOfWork: propertyDesc || docType,
    serviceCategory: isLease ? 'rent' : 'other',
    gstStatus: gstins.length > 0 ? 'registered' : 'unregistered',
    gstType: 'NO_GST',
    gstRate: 0,
    maxPoQty: termMatch ? Number(termMatch[1]) : 12,
    maxPoValue: totalAmount || monthlyAmount * 12,
    maxDieselQty: 0,
    autoFetchable: {
      poNumber: certNo || '',
      vendorName: firstParty,
      vendorGstin: gstins.length > 1 ? gstins[1] : '',
      vendorPan,
      msmeNumber: '',
      supplierCode: '',
      documentType: docType,
      term,
      monthlyRent: monthlyAmount,
      propertyAddress,
    },
    manualRequired: [
      { field: 'invoiceNumber', label: 'Invoice Number', reason: 'Vendor generates monthly' },
      { field: 'invoiceDate', label: 'Invoice Date', reason: 'Date of bill raising' },
      { field: 'billingPeriod', label: 'Billing Month', reason: 'Which month rent is for' },
    ],
    _extractionMethod: 'node-generic-document',
    _documentType: docType,
  };

  return result;
}
