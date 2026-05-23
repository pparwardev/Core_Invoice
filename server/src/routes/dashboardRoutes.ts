import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

export function createDashboardRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  router.get('/', async (req: Request, res: Response) => {
    try {
      const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

      const totalVendors = await db('vendors').where('is_active', true).count('* as c').first();
      const activeVendors = Number(totalVendors?.c || 0);

      // Department breakdown with section IDs
      const departments = await db('vendor_sections')
        .join('sections', 'vendor_sections.section_id', 'sections.id')
        .join('vendors', 'vendor_sections.vendor_id', 'vendors.id')
        .where('vendors.is_active', true)
        .select('sections.id as sectionId', 'sections.name as section')
        .count('vendors.id as vendorCount')
        .groupBy('sections.id', 'sections.name');

      // Service type breakdown
      const serviceTypes = await db('vendors')
        .where('is_active', true)
        .select('service_type as serviceType')
        .count('* as total')
        .groupBy('service_type')
        .orderBy('total', 'desc');

      // Get billed counts per service type for this month
      const billedByService = await db('billing_records')
        .join('vendors', 'billing_records.vendor_id', 'vendors.id')
        .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
        .where({ billing_period_month: month, billing_period_year: year })
        .select('vendors.service_type as serviceType')
        .sum('invoices.invoice_value as totalBilled')
        .count('* as done')
        .groupBy('vendors.service_type');

      const serviceTypeBreakdown = serviceTypes.map((st: any) => {
        const billed = billedByService.find((b: any) => b.serviceType === st.serviceType);
        return {
          serviceType: st.serviceType,
          total: Number(st.total),
          done: Number(billed?.done || 0),
          totalBilled: Number(billed?.totalBilled || 0),
        };
      });

      // Recent activity - recent billing records with vendor info
      const recentBills = await db('billing_records')
        .join('vendors', 'billing_records.vendor_id', 'vendors.id')
        .leftJoin('purchase_orders', 'billing_records.purchase_order_id', 'purchase_orders.id')
        .leftJoin('vendor_sections', 'vendors.id', 'vendor_sections.vendor_id')
        .leftJoin('sections', 'vendor_sections.section_id', 'sections.id')
        .select(
          'billing_records.id',
          'vendors.name as vendorName',
          'vendors.service_type as serviceType',
          'purchase_orders.po_number as poNumber',
          'sections.name as section',
          'billing_records.status',
          'billing_records.updated_at as date'
        )
        .orderBy('billing_records.updated_at', 'desc')
        .limit(10);

      // PO expiry alerts
      const today = new Date().toISOString().split('T')[0];
      const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const poAlerts = await db('purchase_orders')
        .where('validity_date', '<=', thirtyDays)
        .where('validity_date', '>=', today)
        .count('* as c').first();

      // Budget warnings (>80%)
      const allPos = await db('purchase_orders').select('id', 'po_value');
      let budgetWarnings = 0;
      for (const po of allPos) {
        const billed = await db('billing_records')
          .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
          .where('billing_records.purchase_order_id', po.id)
          .sum('invoices.invoice_value as total').first();
        if (Number(billed?.total || 0) / Number(po.po_value) >= 0.8) budgetWarnings++;
      }

      res.json({
        totalVendors: activeVendors,
        activeVendors,
        poExpiryAlerts: Number(poAlerts?.c || 0),
        budgetWarnings,
        departmentBreakdown: departments,
        serviceTypeBreakdown,
        recentActivity: recentBills,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  return router;
}
