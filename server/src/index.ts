import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './database/connection.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createVendorRoutes } from './routes/vendorRoutes.js';
import { createBillingRoutes } from './routes/billingRoutes.js';
import { createDashboardRoutes } from './routes/dashboardRoutes.js';
import { createDieselRoutes } from './routes/dieselRoutes.js';
import { createDocumentRoutes } from './routes/documentRoutes.js';
import { createCompanyRoutes } from './routes/companyRoutes.js';
import { createOcrRoutes } from './routes/ocrRoutes.js';
import { createReportRoutes } from './routes/reportRoutes.js';
import { createPoReaderRoutes } from './routes/poReaderRoutes.js';
import { createNotificationRoutes } from './routes/notificationRoutes.js';
import { createChatbotRoutes } from './routes/chatbotRoutes.js';
import { createNotification, notificationExists } from './services/notificationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

const db = getDb();

async function initializeDatabase() {
  try {
    await db.migrate.latest();
    const userCount = await db('users').count('* as count').first();
    if (!userCount || Number(userCount.count) === 0) {
      await db.seed.run();
      console.log('Database seeded with initial data');
    }
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Static uploads
app.use('/uploads', express.static(path.resolve(__dirname, '../data/uploads')));

// API Routes
app.use('/api/auth', createAuthRoutes(db));
app.use('/api/vendors', createVendorRoutes(db));
app.use('/api/billing', createBillingRoutes(db));
app.use('/api/dashboard', createDashboardRoutes(db));
app.use('/api/diesel', createDieselRoutes(db));
app.use('/api/documents', createDocumentRoutes(db));
app.use('/api/company', createCompanyRoutes(db));
app.use('/api/ocr', createOcrRoutes(db));
app.use('/api/reports', createReportRoutes(db));
app.use('/api/po-reader', createPoReaderRoutes(db));
app.use('/api/notifications', createNotificationRoutes(db));
app.use('/api/chat', createChatbotRoutes(db));

// Serve frontend in production
const clientBuildPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Core-Invoice server running on http://localhost:${PORT}`);
  });

  // Scheduled PO expiry check — runs every 24 hours
  async function checkPoExpiry() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const tenDaysLater = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];

      // Check POs expiring within 10 days (not already expired)
      const expiringPOs = await db('purchase_orders')
        .join('vendors', 'purchase_orders.vendor_id', 'vendors.id')
        .where('purchase_orders.validity_date', '>=', today)
        .where('purchase_orders.validity_date', '<=', tenDaysLater)
        .where(function () {
          this.where('purchase_orders.is_expired', false).orWhereNull('purchase_orders.is_expired');
        })
        .select('purchase_orders.*', 'vendors.name as vendor_name');

      for (const po of expiringPOs) {
        const daysLeft = Math.ceil((new Date(po.validity_date).getTime() - Date.now()) / 86400000);
        const title = `PO ${po.po_number} for ${po.vendor_name} is expiring in ${daysLeft} days`;
        const exists = await notificationExists(db, title);
        if (!exists) {
          await createNotification(db, {
            type: 'po_expiring_soon',
            title,
            message: `PO ${po.po_number} for ${po.vendor_name} is expiring in ${daysLeft} days`,
            vendor_id: po.vendor_id,
          });
        }
      }

      // Check POs that have expired (validity_date < today and is_expired is false/null)
      const expiredPOs = await db('purchase_orders')
        .join('vendors', 'purchase_orders.vendor_id', 'vendors.id')
        .where('purchase_orders.validity_date', '<', today)
        .where('purchase_orders.validity_date', '!=', '')
        .whereNotNull('purchase_orders.validity_date')
        .where(function () {
          this.where('purchase_orders.is_expired', false).orWhereNull('purchase_orders.is_expired');
        })
        .select('purchase_orders.*', 'vendors.name as vendor_name');

      for (const po of expiredPOs) {
        // Mark as expired
        await db('purchase_orders').where('id', po.id).update({ is_expired: true });

        const title = `PO ${po.po_number} for ${po.vendor_name} has expired`;
        const exists = await notificationExists(db, title);
        if (!exists) {
          await createNotification(db, {
            type: 'po_expired',
            title,
            message: `PO ${po.po_number} for ${po.vendor_name} has expired`,
            vendor_id: po.vendor_id,
          });
        }
      }

      if (expiringPOs.length || expiredPOs.length) {
        console.log(`PO Expiry Check: ${expiringPOs.length} expiring soon, ${expiredPOs.length} newly expired`);
      }
    } catch (error) {
      console.error('PO expiry check error:', error);
    }
  }

  // Run immediately on startup, then every 24 hours
  checkPoExpiry();
  setInterval(checkPoExpiry, 24 * 60 * 60 * 1000);
});

export { app, db };
