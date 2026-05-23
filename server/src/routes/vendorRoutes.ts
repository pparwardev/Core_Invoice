import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { createNotification } from '../services/notificationService.js';

export function createVendorRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // List all vendors (one row per vendor entity)
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { section, serviceType, searchTerm, status } = req.query;
      let query = db('vendors').select('vendors.*');

      if (section) {
        query = query.join('vendor_sections', 'vendors.id', 'vendor_sections.vendor_id')
          .join('sections', 'vendor_sections.section_id', 'sections.id')
          .where('sections.name', section);
      }
      if (searchTerm) query = query.where('vendors.name', 'like', `%${searchTerm}%`);
      if (status === 'active') query = query.where('vendors.is_active', true);
      else if (status === 'inactive') query = query.where('vendors.is_active', false);

      let vendors = await query.orderBy('vendors.name');

      // If filtering by serviceType, filter vendors that have that service
      if (serviceType) {
        const vendorIdsWithService = await db('vendor_services').where('service_type', serviceType).pluck('vendor_id');
        vendors = vendors.filter((v: any) => vendorIdsWithService.includes(v.id));
      }

      const vendorIds = vendors.map((v: any) => v.id);

      // Get services for all vendors
      const services = await db('vendor_services')
        .join('sections', 'vendor_services.section_id', 'sections.id')
        .whereIn('vendor_services.vendor_id', vendorIds)
        .select('vendor_services.*', 'sections.name as section_name', 'sections.code as section_code');

      // Get sections
      const sections = await db('vendor_sections')
        .join('sections', 'vendor_sections.section_id', 'sections.id')
        .whereIn('vendor_sections.vendor_id', vendorIds)
        .select('vendor_sections.vendor_id', 'sections.id', 'sections.name', 'sections.code');

      // Get POs
      const purchaseOrders = await db('purchase_orders')
        .whereIn('vendor_id', vendorIds)
        .select('id', 'vendor_id', 'po_number', 'po_date', 'validity_date', 'po_value', 'service_description', 'is_expired');

      const result = vendors.map((v: any) => {
        const vendorServices = services.filter((s: any) => s.vendor_id === v.id);
        const allServiceTypes = vendorServices.map((s: any) => s.service_type);
        return {
          ...v,
          gstRegistered: Boolean(v.gst_registered),
          isActive: Boolean(v.is_active),
          sections: sections.filter((s: any) => s.vendor_id === v.id).map((s: any) => ({ id: s.id, name: s.name, code: s.code })),
          purchase_orders: purchaseOrders.filter((po: any) => po.vendor_id === v.id),
          all_services: allServiceTypes,
          service_count: vendorServices.length,
        };
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch vendors' });
    }
  });

  // Get single vendor detail with all services, POs, bills
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const vendor = await db('vendors').where('id', req.params.id).first();
      if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }

      // Get all services for this vendor with department info
      const serviceLines = await db('vendor_services')
        .join('sections', 'vendor_services.section_id', 'sections.id')
        .where('vendor_services.vendor_id', vendor.id)
        .select(
          'vendor_services.id as id',
          'vendor_services.vendor_id',
          'vendor_services.section_id',
          'vendor_services.service_type',
          'vendor_services.service_subtype',
          'vendor_services.vendor_code',
          'vendor_services.vehicle_number',
          'vendor_services.vehicle_model',
          'vendor_services.po_id',
          'vendor_services.po_number',
          'vendor_services.item_code',
          'vendor_services.hsn_sac',
          'vendor_services.po_validity',
          'sections.name as section_name',
          'sections.code as section_code'
        );

      // Get sections
      const sections = await db('vendor_sections')
        .join('sections', 'vendor_sections.section_id', 'sections.id')
        .where('vendor_sections.vendor_id', vendor.id)
        .select('sections.id', 'sections.name', 'sections.code');

      // Get POs
      const purchaseOrders = await db('purchase_orders').where('vendor_id', vendor.id);
      const posWithUtilization = await Promise.all(purchaseOrders.map(async (po: any) => {
        const totalBilled = await db('billing_records')
          .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
          .where('billing_records.purchase_order_id', po.id)
          .sum('invoices.invoice_value as total')
          .first();
        const billed = Number(totalBilled?.total || 0);
        const poVal = Number(po.po_value);

        // Get mapped services for this PO
        const mappedServices = await db('vendor_services')
          .join('sections', 'vendor_services.section_id', 'sections.id')
          .where('vendor_services.po_id', po.id)
          .select('vendor_services.service_type', 'vendor_services.service_subtype', 'sections.name as section_name', 'sections.code as section_code');

        return {
          ...po,
          totalBilled: billed,
          utilizationPct: poVal > 0 ? (billed / poVal) * 100 : 0,
          remaining: poVal - billed,
          mappedServices: mappedServices.map((s: any) => ({
            serviceType: s.service_type,
            serviceSubtype: s.service_subtype,
            department: s.section_name,
            deptCode: s.section_code,
          })),
        };
      }));

      // Get bills
      const bills = await db('billing_records')
        .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
        .where('billing_records.vendor_id', vendor.id)
        .select('billing_records.*', 'invoices.invoice_number', 'invoices.invoice_value', 'invoices.invoice_date', 'invoices.service_type')
        .orderBy('billing_records.billing_period_year', 'desc')
        .orderBy('billing_records.billing_period_month', 'desc')
        .limit(50);

      res.json({
        ...vendor,
        gstRegistered: Boolean(vendor.gst_registered),
        isActive: Boolean(vendor.is_active),
        sections,
        serviceLines: serviceLines.map((s: any) => ({
          id: s.id,
          serviceType: s.service_type,
          serviceSubtype: s.service_subtype,
          vendorCode: s.vendor_code,
          sectionName: s.section_name,
          sectionCode: s.section_code,
          vehicleNumber: s.vehicle_number,
          poId: s.po_id,
          poNumber: s.po_number,
          itemCode: s.item_code,
          hsnSac: s.hsn_sac,
          poValidity: s.po_validity,
        })),
        purchaseOrders: posWithUtilization,
        bills,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch vendor' });
    }
  });

  // Create vendor
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { sectionIds, services, ...vendorData } = req.body;
      const vendorResult = await db('vendors').insert({
        name: vendorData.name,
        vendor_code: vendorData.vendorCode,
        service_type: vendorData.serviceType,
        gstin: vendorData.gstin || null,
        pan: vendorData.pan,
        address: vendorData.address,
        state: vendorData.state,
        state_code: vendorData.stateCode || '21',
        pincode: vendorData.pincode,
        contact_person: vendorData.contactPerson,
        phone: vendorData.phone,
        email: vendorData.email,
        bank_name: vendorData.bankName,
        bank_account_no: vendorData.bankAccountNo,
        bank_ifsc: vendorData.bankIfsc,
        bank_branch: vendorData.bankBranch,
        gst_registered: vendorData.gstRegistered || false,
        vendor_type: vendorData.vendorType || 'Individual',
        is_active: true,
      }).returning('id');
      const vendorId = typeof vendorResult[0] === 'object' ? (vendorResult[0] as any).id : vendorResult[0];

      // Insert section mappings
      if (sectionIds?.length) {
        for (const sid of sectionIds) {
          await db('vendor_sections').insert({ vendor_id: vendorId, section_id: sid }).catch(() => {});
        }
      }

      // Insert service lines with POs
      if (services?.length) {
        for (const svc of services) {
          await db('vendor_services').insert({
            vendor_id: vendorId,
            section_id: svc.sectionId,
            service_type: svc.serviceType,
            vendor_code: vendorData.vendorCode,
          });

          // Also add section mapping if not already
          await db('vendor_sections').insert({ vendor_id: vendorId, section_id: svc.sectionId }).catch(() => {});

          // Create PO if provided
          if (svc.poNumber) {
            await db('purchase_orders').insert({
              vendor_id: vendorId,
              po_number: svc.poNumber,
              po_date: svc.poStartDate || null,
              validity_date: svc.poEndDate || null,
              po_value: 0,
              service_description: svc.serviceType,
            });
          }
        }
      }

      res.status(201).json({ id: vendorId, message: 'Vendor created' });

      // Create notification for new vendor (fire-and-forget, after response)
      createNotification(db, {
        type: 'vendor_added',
        title: `New vendor ${vendorData.name} is added`,
        message: `New vendor ${vendorData.name} is added`,
        vendor_id: vendorId as number,
      }).catch(() => {});
    } catch (error) {
      res.status(500).json({ error: 'Failed to create vendor' });
    }
  });

  // Update vendor
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { sectionIds, ...data } = req.body;
      await db('vendors').where('id', req.params.id).update({
        name: data.name,
        vendor_code: data.vendorCode,
        service_type: data.serviceType,
        gstin: data.gstin,
        pan: data.pan,
        address: data.address,
        state_code: data.stateCode,
        contact_person: data.contactPerson,
        phone: data.phone,
        email: data.email,
        bank_name: data.bankName,
        bank_account_no: data.bankAccountNo,
        bank_ifsc: data.bankIfsc,
        bank_branch: data.bankBranch,
        gst_registered: data.gstRegistered,
        vendor_type: data.vendorType,
        is_active: data.isActive,
        updated_at: db.fn.now(),
      });

      if (sectionIds) {
        await db('vendor_sections').where('vendor_id', req.params.id).del();
        if (sectionIds.length) {
          await db('vendor_sections').insert(sectionIds.map((sid: number) => ({ vendor_id: req.params.id, section_id: sid })));
        }
      }
      res.json({ message: 'Vendor updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update vendor' });
    }
  });

  // Add service to vendor
  router.post('/:id/services', async (req: Request, res: Response) => {
    try {
      const vendorId = req.params.id;
      const { serviceType, sectionId } = req.body;
      if (!serviceType || !sectionId) { res.status(400).json({ error: 'serviceType and sectionId required' }); return; }
      await db('vendor_services').insert({
        vendor_id: vendorId,
        section_id: sectionId,
        service_type: serviceType,
      });
      // Ensure vendor_sections mapping exists
      const exists = await db('vendor_sections').where({ vendor_id: vendorId, section_id: sectionId }).first();
      if (!exists) await db('vendor_sections').insert({ vendor_id: vendorId, section_id: sectionId });

      // Create notification for new service
      const vendor = await db('vendors').where('id', vendorId).select('name').first();
      const vendorName = vendor?.name || 'vendor';
      createNotification(db, {
        type: 'service_added',
        title: `New service ${serviceType} is added for ${vendorName}`,
        message: `New service ${serviceType} is added for ${vendorName}`,
        vendor_id: Number(vendorId),
      }).catch(() => {});

      res.json({ message: 'Service added' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add service' });
    }
  });

  // Remove service from vendor
  router.delete('/:id/services/:serviceId', async (req: Request, res: Response) => {
    try {
      await db('vendor_services').where('id', req.params.serviceId).where('vendor_id', req.params.id).del();
      res.json({ message: 'Service removed' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove service' });
    }
  });

  // Delete vendor
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const vendorId = req.params.id;
      await db('vendor_services').where('vendor_id', vendorId).del();
      await db('vendor_sections').where('vendor_id', vendorId).del();
      await db('purchase_orders').where('vendor_id', vendorId).del();
      await db('vendors').where('id', vendorId).del();
      res.json({ message: 'Vendor deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete vendor' });
    }
  });

  // ===== BULK UPLOAD: Download Template =====
  router.get('/bulk/template', async (req: Request, res: Response) => {
    const headers = [
      'Name*', 'Service Type*', 'Vendor Code', 'GSTIN', 'PAN', 'Address', 'State',
      'State Code', 'Pincode', 'Contact Person', 'Phone', 'Email',
      'Bank Name', 'Bank Account No', 'Bank IFSC', 'Bank Branch',
      'GST Registered (Yes/No)', 'Vendor Type (Individual/Firm/Company/LLP)',
      'Department (REFINERY/POWER-ENGINEERING SERVICE/MINES)',
      'PO Number', 'PO Start Date (DD/MM/YYYY)', 'PO End Date (DD/MM/YYYY)', 'PO Value'
    ];
    const csv = headers.join(',') + '\n' +
      'Example Vendor,Bus Service,V001,21XXXXX1234X1Z5,ABCDE1234F,"Main Road, City",Odisha,21,765001,John Doe,9876543210,vendor@email.com,SBI,1234567890,SBIN0001234,Main Branch,Yes,Individual,REFINERY,4200008XXX,01/04/2026,31/03/2027,500000\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Vendor_Bulk_Upload_Template.csv');
    res.send('\ufeff' + csv);
  });

  // ===== BULK UPLOAD: Process Excel/CSV =====
  router.post('/bulk/upload', async (req: Request, res: Response) => {
    try {
      const { rows } = req.body; // Array of row objects from frontend parsing
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: 'No data provided. Upload a filled CSV/Excel file.' });
        return;
      }

      const results: any[] = [];
      const sections = await db('sections').select('*');

      for (const row of rows) {
        try {
          const name = (row['Name*'] || row['Name'] || row['name'] || '').trim();
          const serviceType = (row['Service Type*'] || row['Service Type'] || row['service_type'] || '').trim();

          if (!name) { results.push({ name: '(empty)', status: 'skipped', reason: 'Name is required' }); continue; }

          // Check if vendor already exists
          const existing = await db('vendors').where('name', name).first();
          if (existing) { results.push({ name, status: 'skipped', reason: 'Already exists' }); continue; }

          // Insert vendor
          const vendorInsert = await db('vendors').insert({
            name,
            service_type: serviceType || 'General',
            vendor_code: (row['Vendor Code'] || row['vendor_code'] || '').trim() || null,
            gstin: (row['GSTIN'] || row['gstin'] || '').trim() || null,
            pan: (row['PAN'] || row['pan'] || '').trim() || null,
            address: (row['Address'] || row['address'] || '').trim() || null,
            state: (row['State'] || row['state'] || 'Odisha').trim(),
            state_code: (row['State Code'] || row['state_code'] || '21').trim(),
            pincode: (row['Pincode'] || row['pincode'] || '').trim() || null,
            contact_person: (row['Contact Person'] || row['contact_person'] || '').trim() || null,
            phone: (row['Phone'] || row['phone'] || '').trim() || null,
            email: (row['Email'] || row['email'] || '').trim() || null,
            bank_name: (row['Bank Name'] || row['bank_name'] || '').trim() || null,
            bank_account_no: (row['Bank Account No'] || row['bank_account_no'] || '').trim() || null,
            bank_ifsc: (row['Bank IFSC'] || row['bank_ifsc'] || '').trim() || null,
            bank_branch: (row['Bank Branch'] || row['bank_branch'] || '').trim() || null,
            gst_registered: (row['GST Registered (Yes/No)'] || row['gst_registered'] || '').toLowerCase().includes('yes'),
            vendor_type: (row['Vendor Type (Individual/Firm/Company/LLP)'] || row['vendor_type'] || 'Individual').trim(),
            is_active: true,
          }).returning('id');
          const vendorId = typeof vendorInsert[0] === 'object' ? (vendorInsert[0] as any).id : vendorInsert[0];

          // Map to department/section
          const deptName = (row['Department (REFINERY/POWER-ENGINEERING SERVICE/MINES)'] || row['Department'] || row['department'] || '').trim();
          if (deptName) {
            const section = sections.find((s: any) => s.name.toLowerCase().includes(deptName.toLowerCase()) || s.code.toLowerCase().includes(deptName.toLowerCase()));
            if (section) {
              await db('vendor_sections').insert({ vendor_id: vendorId, section_id: section.id }).catch(() => {});
              // Add service line
              if (serviceType) {
                await db('vendor_services').insert({ vendor_id: vendorId, section_id: section.id, service_type: serviceType }).catch(() => {});
              }
            }
          }

          // Create PO if provided
          const poNumber = (row['PO Number'] || row['po_number'] || '').trim();
          if (poNumber) {
            const poStart = (row['PO Start Date (DD/MM/YYYY)'] || row['po_start_date'] || '').trim();
            const poEnd = (row['PO End Date (DD/MM/YYYY)'] || row['po_end_date'] || '').trim();
            const poValue = parseFloat((row['PO Value'] || row['po_value'] || '0').toString().replace(/[₹,]/g, '')) || 0;
            await db('purchase_orders').insert({
              vendor_id: vendorId,
              po_number: poNumber,
              po_date: poStart || null,
              validity_date: poEnd || null,
              po_value: poValue,
              service_description: serviceType,
            });
          }

          results.push({ name, status: 'created', vendorId });
        } catch (err: any) {
          results.push({ name: row['Name*'] || row['Name'] || '?', status: 'error', reason: err.message?.substring(0, 80) });
        }
      }

      const created = results.filter(r => r.status === 'created').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      const errors = results.filter(r => r.status === 'error').length;

      res.json({
        message: `Bulk upload complete: ${created} created, ${skipped} skipped, ${errors} errors`,
        summary: { created, skipped, errors, total: rows.length },
        results,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Bulk upload failed: ' + error.message });
    }
  });

  return router;
}
