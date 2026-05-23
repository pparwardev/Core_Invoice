import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createNotification } from '../services/notificationService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractPoData } from '../services/poExtractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `po-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

export function createPoReaderRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // Upload and extract PO data using local pdfplumber (no API needed)
  router.post('/extract', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

      // Call PO extractor (tries Python/pdfplumber first, falls back to Node.js/pdf-parse)
      const extracted = await extractPoData(req.file.path);

      if (extracted.error) {
        res.status(422).json({ error: extracted.error });
        return;
      }

      // Auto-map to vendor by name, then GSTIN, then supplier code
      let vendorId: number | null = null;
      if (extracted.supplierName) {
        const fullName = extracted.supplierName.trim();
        // Strategy 1: Match by first 25 chars
        let vendor = await db('vendors')
          .where('name', 'like', `%${fullName.substring(0, 25)}%`)
          .first();
        // Strategy 2: Match by first word + second word
        if (!vendor && fullName.includes(' ')) {
          const nameParts = fullName.split(/\s+/);
          const searchTerm = nameParts.slice(0, 2).join(' ');
          vendor = await db('vendors')
            .where('name', 'like', `%${searchTerm}%`)
            .first();
        }
        // Strategy 3: Match by last name
        if (!vendor && fullName.includes(' ')) {
          const lastName = fullName.split(/\s+/).pop() || '';
          if (lastName.length > 3) {
            vendor = await db('vendors')
              .where('name', 'like', `%${lastName}%`)
              .first();
          }
        }
        if (vendor) vendorId = vendor.id;
      }

      // Strategy 4: Match by GSTIN
      if (!vendorId && extracted.vendorGstin) {
        const vendor = await db('vendors')
          .where('gstin', extracted.vendorGstin)
          .first();
        if (vendor) vendorId = vendor.id;
      }

      // Strategy 5: Match by Supplier Code / Vendor Code
      if (!vendorId && extracted.supplierCode) {
        const vendor = await db('vendors')
          .where('vendor_code', extracted.supplierCode)
          .first();
        if (vendor) vendorId = vendor.id;
      }

      // Strategy 6: Match by PAN
      if (!vendorId && extracted.vendorPan) {
        const vendor = await db('vendors')
          .where('pan', extracted.vendorPan)
          .first();
        if (vendor) vendorId = vendor.id;
      }

      res.json({
        success: true,
        extracted,
        vendorId,
        filePath: req.file.filename,
      });
    } catch (error: any) {
      console.error('PO extraction error:', error.message);
      res.status(500).json({ error: 'Failed to extract PO data: ' + error.message });
    }
  });

  // Save extracted PO to database
  router.post('/save', async (req: Request, res: Response) => {
    try {
      const { vendorId, extracted, filePath } = req.body;
      if (!vendorId || !extracted) { res.status(400).json({ error: 'vendorId and extracted data required' }); return; }

      const poNumber = extracted.purchaseOrderNumber || extracted.erpPoNumber || extracted.po_number || 'UNKNOWN';

      // Check for duplicate PO
      const existingPO = await db('purchase_orders')
        .where('vendor_id', vendorId)
        .where('po_number', poNumber)
        .first();

      if (existingPO) {
        const vendor = await db('vendors').where('id', vendorId).select('name').first();
        res.status(409).json({
          error: `Duplicate PO: "${poNumber}" is already uploaded for vendor "${vendor?.name || vendorId}".`,
          duplicate: true,
          existingPoId: existingPO.id,
        });
        return;
      }

      const insertResult = await db('purchase_orders').insert({
        vendor_id: vendorId,
        po_number: poNumber,
        po_date: extracted.orderDate || extracted.po_date || null,
        validity_date: extracted.serviceEndDate || extracted.service_end_date || null,
        po_value: extracted.totalAmount || extracted.total_amount || extracted.grand_total || 0,
        service_description: extracted.lineItems?.[0]?.itemDescription || extracted.line_items?.[0]?.description || '',
        bill_to_name: extracted.billToName || extracted.bill_to_name || null,
        bill_to_address: extracted.billToAddress || extracted.bill_to_address || null,
        ship_to_address: extracted.shipToAddress || extracted.ship_to_address || null,
        supplier_name: extracted.supplierName || extracted.vendor_name || null,
        erp_pr_number: extracted.erpPrNumber || extracted.erp_pr_number || null,
        erp_pr_type: extracted.erpPrType || null,
        erp_po_number: extracted.erpPoNumber || extracted.erp_po_number || null,
        wbs_id: extracted.wbsId || extracted.wbs_id || null,
        payment_terms: extracted.paymentTerms || extracted.payment_terms || null,
        requested_type: extracted.requestedType || null,
        expected_delivery: extracted.expectedDelivery || extracted.delivery_date || null,
        service_start_date: extracted.serviceStartDate || extracted.service_start_date || null,
        service_end_date: extracted.serviceEndDate || extracted.service_end_date || null,
        hsn_sac_code: extracted.lineItems?.[0]?.hsnSac || null,
        item_code: extracted.lineItems?.[0]?.itemCode || null,
        item_description: extracted.lineItems?.[0]?.itemDescription || extracted.line_items?.[0]?.description || null,
        uom: extracted.lineItems?.[0]?.uom || extracted.line_items?.[0]?.unit || null,
        quantity: extracted.lineItems?.[0]?.quantity || extracted.line_items?.[0]?.quantity || null,
        unit_rate: extracted.lineItems?.[0]?.unitRate || extracted.line_items?.[0]?.rate || null,
        basic_amount: extracted.baseValue || extracted.basic_amount || 0,
        cgst_pct: extracted.cgstPct || 0,
        cgst_amt: extracted.cgstAmt || 0,
        sgst_pct: extracted.sgstPct || 0,
        sgst_amt: extracted.sgstAmt || 0,
        total_amount: extracted.totalAmount || extracted.total_amount || extracted.grand_total || 0,
        advance_payable: extracted.advancePayable || 0,
        amount_in_words: extracted.amountInWords || null,
        invoice_requirements: extracted.invoiceRequirements || extracted.invoice_requirements || null,
        extracted_raw_json: JSON.stringify(extracted),
        file_path: filePath || null,
      }).returning('id');

      // Handle both SQLite (returns [number]) and PostgreSQL (returns [{id: number}])
      const poId = typeof insertResult[0] === 'object' ? (insertResult[0] as any).id : insertResult[0];

      // Update vendor_code from PO's supplier code
      const supplierCode = extracted.supplierCode || extracted.supplier_code;
      if (supplierCode) {
        await db('vendors').where('id', vendorId).update({ vendor_code: supplierCode });
      }

      // Auto-set is_expired based on dates (handles DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD)
      const endDateStr = extracted.serviceEndDate || extracted.service_end_date || extracted.validity_date;
      if (endDateStr) {
        let endDateObj: Date | null = null;
        const str = String(endDateStr).trim();
        // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
        const dmy = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
        if (dmy) {
          endDateObj = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        } else {
          // YYYY-MM-DD (ISO)
          endDateObj = new Date(str);
        }
        if (endDateObj && !isNaN(endDateObj.getTime()) && endDateObj.getTime() < Date.now()) {
          await db('purchase_orders').where('id', poId).update({ is_expired: true });
        }
      } else {
        // No end date at all — mark as expired
        await db('purchase_orders').where('id', poId).update({ is_expired: true });
      }

      // Create notification for PO upload
      const vendor = await db('vendors').where('id', vendorId).select('name').first();
      const vendorName = vendor?.name || 'vendor';
      const startDate = extracted.serviceStartDate || extracted.service_start_date || extracted.orderDate || extracted.po_date || '';
      const notifEndDate = extracted.serviceEndDate || extracted.service_end_date || extracted.validity_date || '';
      await createNotification(db, {
        type: 'po_uploaded',
        title: `PO ${poNumber} is uploaded for ${vendorName} with validity from ${startDate} to ${notifEndDate}`,
        message: `PO ${poNumber} is uploaded for ${vendorName} with validity from ${startDate} to ${notifEndDate}`,
        vendor_id: vendorId,
      });

      res.json({ success: true, poId, message: 'PO saved successfully' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to save PO: ' + error.message });
    }
  });

  // Get PO alerts (expiry + budget warnings)
  router.get('/alerts', async (req: Request, res: Response) => {
    try {
      const today = new Date();
      const thirtyDaysLater = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

      const expiringPOs = await db('purchase_orders')
        .join('vendors', 'purchase_orders.vendor_id', 'vendors.id')
        .where('purchase_orders.validity_date', '<=', thirtyDaysLater)
        .where('purchase_orders.validity_date', '>=', today.toISOString().split('T')[0])
        .select('purchase_orders.*', 'vendors.name as vendor_name');

      const allPOs = await db('purchase_orders')
        .join('vendors', 'purchase_orders.vendor_id', 'vendors.id')
        .where('purchase_orders.po_value', '>', 0)
        .select('purchase_orders.*', 'vendors.name as vendor_name');

      const budgetAlerts = [];
      for (const po of allPOs) {
        const billed = await db('billing_records')
          .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
          .where('billing_records.purchase_order_id', po.id)
          .sum('invoices.invoice_value as total').first();
        const totalBilled = Number(billed?.total || 0);
        const pct = (totalBilled / Number(po.po_value)) * 100;
        if (pct >= 80) {
          const daysLeft = po.validity_date ? Math.ceil((new Date(po.validity_date).getTime() - today.getTime()) / 86400000) : null;
          budgetAlerts.push({ ...po, totalBilled, utilizationPct: pct, remaining: Number(po.po_value) - totalBilled, daysLeft });
        }
      }

      res.json({ expiringPOs, budgetAlerts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // Map PO line items to vendor services
  router.post('/map-services', async (req: Request, res: Response) => {
    try {
      const { poId, vendorId, mappings } = req.body;
      // mappings: [{ serviceId, itemCode, hsnSac }]
      if (!vendorId || !mappings?.length) {
        res.status(400).json({ error: 'vendorId and mappings required' });
        return;
      }

      // Get PO details
      const po = poId ? await db('purchase_orders').where('id', poId).first() : null;
      const poNumber = po?.po_number || req.body.poNumber || '';
      const poValidity = po?.validity_date || req.body.poValidity || '';

      for (const mapping of mappings) {
        const serviceId = Number(mapping.serviceId);
        if (!serviceId) continue;
        await db('vendor_services')
          .where('id', serviceId)
          .where('vendor_id', vendorId)
          .update({
            po_id: poId || null,
            po_number: poNumber,
            item_code: mapping.itemCode || null,
            hsn_sac: mapping.hsnSac || null,
            po_validity: poValidity,
          });
      }

      res.json({ success: true, message: `${mappings.length} services mapped to PO` });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to map services: ' + error.message });
    }
  });

  // Serve PO PDF inline (for iframe embedding)
  router.get('/pdf/:filename', async (req: Request, res: Response) => {
    try {
      const filename = path.basename(req.params.filename); // sanitize — no path traversal
      const filePath = path.join(UPLOAD_DIR, filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to serve PDF: ' + error.message });
    }
  });

  // Mark PO as expired
  router.put('/:poId/expire', async (req: Request, res: Response) => {
    try {
      const poId = req.params.poId;
      await db('purchase_orders').where('id', poId).update({ is_expired: true });
      res.json({ success: true, message: 'PO marked as expired' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to mark PO as expired: ' + error.message });
    }
  });

  // Delete a PO
  router.delete('/:poId', async (req: Request, res: Response) => {
    try {
      const poId = req.params.poId;
      // Clear service mappings that reference this PO
      await db('vendor_services').where('po_id', poId).update({
        po_id: null, po_number: null, item_code: null, hsn_sac: null, po_validity: null,
      });
      // Delete the PO
      await db('purchase_orders').where('id', poId).del();
      res.json({ success: true, message: 'PO deleted' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete PO: ' + error.message });
    }
  });

  return router;
}
