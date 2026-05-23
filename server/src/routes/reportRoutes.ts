import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { numToWords, formatIndianCurrency } from '../services/billingEngine.js';

export function createReportRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // Generate Tax Invoice PDF
  router.get('/invoice-pdf/:billingRecordId', async (req: Request, res: Response) => {
    try {
      const record = await db('billing_records').where('id', req.params.billingRecordId).first();
      if (!record) { res.status(404).json({ error: 'Not found' }); return; }

      const vendor = await db('vendors').where('id', record.vendor_id).first();
      const invoice = await db('invoices').where('billing_record_id', record.id).first();
      const lineItems = await db('invoice_line_items').where('invoice_id', invoice.id);
      const company = await db('company_info').first();
      const po = await db('purchase_orders').where('id', record.purchase_order_id).first();

      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', margin: 40 });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoice_number}.pdf`);
      doc.pipe(res);

      // Header
      doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text('Original Invoice', { align: 'center' });
      doc.moveDown();

      // Vendor details
      doc.fontSize(10).font('Helvetica-Bold').text('Vendor Details:');
      doc.font('Helvetica').text(`Name: ${vendor.name}`);
      if (vendor.address) doc.text(`Address: ${vendor.address}`);
      if (vendor.gstin) doc.text(`GSTIN: ${vendor.gstin}`);
      doc.text(`Place of Supply: ${vendor.state || 'Odisha'} (${vendor.state_code || '21'})`);
      doc.moveDown();

      // Invoice details
      doc.font('Helvetica-Bold').text('Invoice Details:');
      doc.font('Helvetica');
      doc.text(`Invoice No: ${invoice.invoice_number}    Date: ${invoice.invoice_date}`);
      if (po) doc.text(`PO Number: ${po.po_number}`);
      if (vendor.vehicle_number) doc.text(`Vehicle No: ${vendor.vehicle_number}`);
      doc.moveDown();

      // Billed To
      doc.font('Helvetica-Bold').text('Billed To:');
      doc.font('Helvetica');
      doc.text(company?.name || 'Bluspring Enterprises Limited');
      doc.text(`GSTIN: ${company?.gstin || '21AAMCB3236E1Z5'}`);
      doc.text(company?.address || 'C/O-UAIL, Doraguda, Rayagada');
      doc.moveDown();

      // Line items table
      doc.font('Helvetica-Bold').text('Service Details:', { underline: true });
      doc.moveDown(0.5);
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Sr', 40, tableTop, { width: 25 });
      doc.text('Description', 65, tableTop, { width: 200 });
      doc.text('HSN/SAC', 265, tableTop, { width: 60 });
      doc.text('Qty', 325, tableTop, { width: 40 });
      doc.text('Rate', 365, tableTop, { width: 60 });
      doc.text('Amount', 425, tableTop, { width: 80 });
      doc.moveTo(40, tableTop + 15).lineTo(555, tableTop + 15).stroke();

      let y = tableTop + 20;
      doc.font('Helvetica').fontSize(9);
      lineItems.forEach((li: any) => {
        doc.text(String(li.sr_no), 40, y, { width: 25 });
        doc.text(li.description || '', 65, y, { width: 200 });
        doc.text(li.hsn_sac || '', 265, y, { width: 60 });
        doc.text(li.quantity ? String(li.quantity) : '', 325, y, { width: 40 });
        doc.text(li.unit_price ? formatIndianCurrency(Number(li.unit_price)) : '', 365, y, { width: 60 });
        doc.text(formatIndianCurrency(Number(li.amount)), 425, y, { width: 80 });
        y += 18;
      });

      // Totals
      y += 10;
      doc.moveTo(40, y).lineTo(555, y).stroke();
      y += 10;
      doc.font('Helvetica-Bold');
      doc.text(`Basic Value: ${formatIndianCurrency(Number(invoice.basic_value))}`, 300, y);
      y += 15;

      const isIntra = (vendor.state_code || '21') === '21';
      if (isIntra) {
        doc.text(`CGST (${Number(invoice.gst_percentage) / 2}%): ${formatIndianCurrency(Number(invoice.gst_amount) / 2)}`, 300, y); y += 15;
        doc.text(`SGST (${Number(invoice.gst_percentage) / 2}%): ${formatIndianCurrency(Number(invoice.gst_amount) / 2)}`, 300, y); y += 15;
      } else {
        doc.text(`IGST (${invoice.gst_percentage}%): ${formatIndianCurrency(Number(invoice.gst_amount))}`, 300, y); y += 15;
      }
      doc.fontSize(11).text(`Grand Total: ${formatIndianCurrency(Number(invoice.invoice_value))}`, 300, y);
      y += 20;
      doc.fontSize(9).font('Helvetica').text(`Amount in Words: ${numToWords(Number(invoice.invoice_value))}`, 40, y);

      // Footer
      doc.moveDown(3);
      doc.font('Helvetica').fontSize(9);
      doc.text('Declaration: We declare that this invoice shows the actual price of the services described.', 40);
      doc.moveDown(2);
      doc.text('Authorized Signatory', 400);

      doc.end();
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // Generate WCR PDF
  router.get('/wcr-pdf/:billingRecordId', async (req: Request, res: Response) => {
    try {
      const record = await db('billing_records').where('id', req.params.billingRecordId).first();
      if (!record) { res.status(404).json({ error: 'Not found' }); return; }

      const wcr = await db('work_completion_reports').where('billing_record_id', record.id).first();
      if (!wcr) { res.status(404).json({ error: 'WCR not found' }); return; }

      const vendor = await db('vendors').where('id', record.vendor_id).first();
      const signatories = await db('wcr_signatories').where('wcr_id', wcr.id).orderBy('sign_order');

      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=wcr-${wcr.id}.pdf`);
      doc.pipe(res);

      doc.fontSize(12).font('Helvetica-Bold').text('WORK COMPLETION REPORT', { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(`Doc Ref: ${wcr.document_ref || 'QHSE-AC-F-0002-5'}, ${wcr.revision || 'Rev 4'}`, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Date: ${wcr.report_date}`);
      doc.text(`Site: ${wcr.site_name || 'UAIL Refinery'}`);
      doc.text(`Location: ${wcr.location || 'Doraguda, Rayagada'}`);
      doc.text(`Client: ${wcr.client_name || 'Bluspring Enterprises Limited'}`);
      doc.text(`Vendor: ${vendor.name}`);
      doc.text(`Invoice Ref: ${wcr.invoice_reference || ''}`);
      doc.text(`Invoice Value: ${formatIndianCurrency(Number(wcr.invoice_value || 0))}`);
      doc.text(`Amount in Words: ${wcr.amount_in_words || ''}`);
      doc.moveDown();

      doc.font('Helvetica-Bold').text('Work Summary:');
      doc.font('Helvetica').text(wcr.work_summary || '');
      doc.moveDown();
      doc.text(`Mode of Delivery: ${wcr.mode_of_delivery}`);
      if (wcr.documents_enclosed) doc.text(`Documents Enclosed: ${wcr.documents_enclosed}`);
      doc.moveDown(2);

      // Signature chain
      doc.font('Helvetica-Bold').text('Signature Chain:');
      doc.moveDown();
      signatories.forEach((s: any) => {
        doc.font('Helvetica').text(`${s.sign_order}. ${s.role}: ${s.name || '________________'}`);
        doc.moveDown(0.5);
      });

      doc.end();
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate WCR PDF' });
    }
  });

  return router;
}
