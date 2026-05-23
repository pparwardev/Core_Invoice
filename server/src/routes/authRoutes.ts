import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import { sendVerificationEmail } from '../services/emailService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = process.env.JWT_SECRET || 'core-invoice-secret-key-2025';

export function createAuthRoutes(db: Knex): Router {
  const router = Router();

  // Register with extended fields
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { user_id, name, email, password, phone, designation, company_name, role } = req.body;

      // Validation
      if (!user_id || !name || !email || !password) {
        res.status(400).json({ error: 'User ID, name, email and password are required' });
        return;
      }

      // Password strength validation
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }
      if (!/[A-Z]/.test(password)) {
        res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
        return;
      }
      if (!/[a-z]/.test(password)) {
        res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
        return;
      }
      if (!/[0-9]/.test(password)) {
        res.status(400).json({ error: 'Password must contain at least one number' });
        return;
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        res.status(400).json({ error: 'Password must contain at least one special character' });
        return;
      }

      // Check existing email
      const existingEmail = await db('users').where('email', email).first();
      if (existingEmail) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      // Check existing user_id
      const existingUserId = await db('users').where('user_id', user_id).first();
      if (existingUserId) {
        res.status(409).json({ error: 'User ID already taken' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      await db('users').insert({
        user_id,
        name,
        email,
        password_hash: passwordHash,
        phone: phone || null,
        designation: designation || null,
        company_name: company_name || null,
        role: role || 'guest',
        email_verified: false,
        verification_token: verificationToken,
        verification_token_expires: tokenExpires,
      });

      // Send verification email (non-blocking — don't wait for it)
      sendVerificationEmail(email, name, verificationToken).catch(() => {});

      res.status(201).json({
        message: "Account created! Pending admin approval. You'll be able to login once approved.",
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Verify email
  router.get('/verify-email', async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      if (!token) {
        res.status(400).send(verificationPage('Invalid verification link.', false));
        return;
      }

      const user = await db('users').where('verification_token', token).first();
      if (!user) {
        res.status(400).send(verificationPage('Invalid or expired verification link.', false));
        return;
      }

      if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date()) {
        res.status(400).send(verificationPage('Verification link has expired. Please register again.', false));
        return;
      }

      await db('users').where('id', user.id).update({
        email_verified: true,
        verification_token: null,
        verification_token_expires: null,
      });

      res.send(verificationPage('Your email has been verified successfully! You can now login.', true));
    } catch (error) {
      res.status(500).send(verificationPage('Verification failed. Please try again.', false));
    }
  });

  // Resend verification email
  router.post('/resend-verification', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const user = await db('users').where('email', email).first();
      if (!user) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      if (user.email_verified) {
        res.status(400).json({ error: 'Email already verified' });
        return;
      }

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await db('users').where('id', user.id).update({
        verification_token: verificationToken,
        verification_token_expires: tokenExpires,
      });

      await sendVerificationEmail(email, user.name, verificationToken);
      res.json({ message: 'Verification email sent' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to resend verification email' });
    }
  });

  // Login (accepts user_id or email)
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { user_id, email, password } = req.body;
      const loginId = user_id || email;
      if (!loginId || !password) {
        res.status(400).json({ error: 'User ID and password are required' });
        return;
      }

      // Find user by user_id or email
      let user = await db('users').where('user_id', loginId).first();
      if (!user) {
        user = await db('users').where('email', loginId).first();
      }
      if (!user) {
        await db('login_history').insert({
          user_id: null,
          user_name: loginId,
          login_id: loginId,
          success: false,
          ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          user_agent: (req.headers['user-agent'] || '').substring(0, 200),
        }).catch(() => {});
        res.status(401).json({ error: 'Invalid User ID or password' });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        await db('login_history').insert({
          user_id: user?.id || null,
          user_name: user?.name || loginId,
          login_id: loginId,
          success: false,
          ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          user_agent: (req.headers['user-agent'] || '').substring(0, 200),
        }).catch(() => {});
        res.status(401).json({ error: 'Invalid User ID or password' });
        return;
      }

      // Email verification check skipped for now (enable when SMTP is configured)
      // if (user.email_verified === false || user.email_verified === 0) {
      //   res.status(403).json({ error: 'Please verify your email before logging in. Check your inbox.' });
      //   return;
      // }

      // Check if user is approved
      if (!user.is_approved && user.is_approved !== 1) {
        res.status(403).json({ error: 'Your account is pending admin approval. Please wait for approval.' });
        return;
      }
      // Check if user is active
      if (user.is_active === false || user.is_active === 0) {
        res.status(403).json({ error: 'Your account has been deactivated. Contact admin.' });
        return;
      }
      // Update last_login
      await db('users').where('id', user.id).update({ last_login: new Date().toISOString() });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      // Get user permissions
      const permissions = await db('user_permissions').where('user_id', user.id).select('module', 'can_view', 'can_create', 'can_edit', 'can_delete');

      await db('login_history').insert({
        user_id: user.id,
        user_name: user.name,
        login_id: loginId,
        success: true,
        ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        user_agent: (req.headers['user-agent'] || '').substring(0, 200),
      }).catch(() => {});

      res.json({
        token,
        user: {
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          designation: user.designation,
          company_name: user.company_name,
          role: user.role || 'guest',
          permissions: permissions.length > 0 ? permissions : getDefaultPermissions(user.role || 'guest'),
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Get current user profile
  router.get('/me', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const user = await db('users').where('id', userId).first();
      const permissions = await db('user_permissions').where('user_id', userId).select('module', 'can_view', 'can_create', 'can_edit', 'can_delete');
      res.json({
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        designation: user.designation,
        company_name: user.company_name,
        role: user.role || 'guest',
        permissions: permissions.length > 0 ? permissions : getDefaultPermissions(user.role || 'guest'),
        created_at: user.created_at,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  // Update profile
  router.put('/profile', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { name, phone, designation, company_name } = req.body;

      const updates: any = { updated_at: new Date().toISOString() };
      if (name) updates.name = name;
      if (phone !== undefined) updates.phone = phone;
      if (designation !== undefined) updates.designation = designation;
      if (company_name !== undefined) updates.company_name = company_name;

      await db('users').where('id', userId).update(updates);
      const updatedUser = await db('users').where('id', userId).first();

      res.json({
        id: updatedUser.id,
        user_id: updatedUser.user_id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        designation: updatedUser.designation,
        company_name: updatedUser.company_name,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Update password
  router.put('/password', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      const user = await db('users').where('id', userId).first();
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      // Validate new password strength
      if (new_password.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
      }
      if (!/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[0-9]/.test(new_password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(new_password)) {
        res.status(400).json({ error: 'New password must contain uppercase, lowercase, number and special character' });
        return;
      }

      const newHash = await bcrypt.hash(new_password, 10);
      await db('users').where('id', userId).update({ password_hash: newHash, updated_at: new Date().toISOString() });

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  // ===== ROLE & PERMISSION MANAGEMENT (Admin/Manager) =====

  // Get all users with roles (for admin/manager)
  router.get('/users', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ error: 'Only admins and managers can view users' });
        return;
      }

      const users = await db('users').select('id', 'user_id', 'name', 'email', 'role', 'is_active', 'designation', 'company_name', 'created_at');
      // Get permissions for each user
      const allPermissions = await db('user_permissions').select('*');
      const usersWithPerms = users.map((u: any) => ({
        ...u,
        permissions: allPermissions.filter((p: any) => p.user_id === u.id),
      }));
      res.json(usersWithPerms);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Update user role (admin/manager only)
  router.put('/users/:userId/role', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ error: 'Only admins and managers can change roles' });
        return;
      }
      const { role } = req.body;
      if (!['admin', 'manager', 'associate', 'guest'].includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      await db('users').where('id', req.params.userId).update({ role });
      // If setting to manager or admin, give full permissions
      if (role === 'manager' || role === 'admin') {
        await db('user_permissions').where('user_id', req.params.userId).del();
      }

      res.json({ message: 'Role updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  // Set permissions for a user (admin/manager only)
  router.put('/users/:userId/permissions', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        res.status(403).json({ error: 'Only admins and managers can set permissions' });
        return;
      }

      const { permissions } = req.body; // Array of { module, can_view, can_create, can_edit, can_delete }
      const userId = Number(req.params.userId);

      // Delete existing permissions
      await db('user_permissions').where('user_id', userId).del();

      // Insert new permissions
      if (permissions && Array.isArray(permissions)) {
        for (const perm of permissions) {
          await db('user_permissions').insert({
            user_id: userId,
            module: perm.module,
            can_view: Boolean(perm.can_view),
            can_create: Boolean(perm.can_create),
            can_edit: Boolean(perm.can_edit),
            can_delete: Boolean(perm.can_delete),
          });
        }
      }

      res.json({ message: 'Permissions updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  });

  // Activate user (admin only)
  router.put('/users/:userId/activate', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can activate users' });
        return;
      }

      await db('users').where('id', req.params.userId).update({ is_active: true });
      res.json({ message: 'User activated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to activate user' });
    }
  });

  // Deactivate user (admin only)
  router.put('/users/:userId/deactivate', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can deactivate users' });
        return;
      }

      await db('users').where('id', req.params.userId).update({ is_active: false });
      res.json({ message: 'User deactivated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to deactivate user' });
    }
  });

  // Delete user permanently (admin only)
  router.delete('/users/:userId', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Only admins can delete users' }); return; }
      const targetUser = await db('users').where('id', req.params.userId).first();
      if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }
      if (targetUser.role === 'admin') { res.status(403).json({ error: 'Cannot delete admin account' }); return; }

      // Delete related data
      await db('user_permissions').where('user_id', req.params.userId).del();
      await db('login_history').where('user_id', req.params.userId).del();
      await db('users').where('id', req.params.userId).del();

      res.json({ message: `User "${targetUser.name}" permanently deleted` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // ===== ADMIN DASHBOARD ENDPOINTS =====

  // GET /admin/stats — Dashboard statistics
  router.get('/admin/stats', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      const totalUsers = await db('users').count('* as c').first();
      const activeUsers = await db('users').where('is_active', true).count('* as c').first();
      const pendingApproval = await db('users').where('is_approved', false).count('* as c').first();
      const totalVendors = await db('vendors').where('is_active', true).count('* as c').first();
      const totalPOs = await db('purchase_orders').count('* as c').first();
      const activePOs = await db('purchase_orders').where(function () { this.where('is_expired', false).orWhereNull('is_expired'); }).count('* as c').first();
      const totalBills = await db('billing_records').count('* as c').first();
      const totalBilledValue = await db('invoices').sum('invoice_value as total').first();
      const totalPOValue = await db('purchase_orders').sum('po_value as total').first();
      const recentNotifications = await db('notifications').orderBy('created_at', 'desc').limit(20);
      const pendingUsers = await db('users').where('is_approved', false).select('id', 'user_id', 'name', 'email', 'role', 'designation', 'company_name', 'created_at');

      // Monthly billing data (last 6 months)
      const monthlyBilling = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const monthBills = await db('billing_records')
          .join('invoices', 'billing_records.id', 'invoices.billing_record_id')
          .where('billing_records.billing_period_month', month)
          .where('billing_records.billing_period_year', year)
          .sum('invoices.invoice_value as total')
          .count('* as count')
          .first();
        monthlyBilling.push({ month, year, total: Number(monthBills?.total || 0), count: Number(monthBills?.count || 0) });
      }

      res.json({
        users: { total: totalUsers?.c, active: activeUsers?.c, pendingApproval: pendingApproval?.c },
        vendors: { total: totalVendors?.c },
        purchaseOrders: { total: totalPOs?.c, active: activePOs?.c, totalValue: Number(totalPOValue?.total || 0) },
        billing: { total: totalBills?.c, totalValue: Number(totalBilledValue?.total || 0) },
        monthlyBilling,
        recentNotifications,
        pendingUsers,
      });
    } catch (error: any) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // PUT /admin/approve/:userId — Approve user
  router.put('/admin/approve/:userId', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
      }
      await db('users').where('id', req.params.userId).update({ is_approved: true });
      res.json({ message: 'User approved' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to approve user' });
    }
  });

  // PUT /admin/reject/:userId — Reject (delete) user
  router.put('/admin/reject/:userId', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
      }
      await db('users').where('id', req.params.userId).del();
      res.json({ message: 'User rejected and removed' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reject user' });
    }
  });


  // ===== ADMIN PHASE 2 ENDPOINTS =====

  // GET /admin/login-history — Login history
  router.get('/admin/login-history', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
      const history = await db('login_history').orderBy('created_at', 'desc').limit(100);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch login history' });
    }
  });

  // GET /admin/db-stats — Database table stats
  router.get('/admin/db-stats', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      const tables = ['users', 'vendors', 'purchase_orders', 'billing_records', 'invoices', 'vendor_services', 'sections', 'notifications', 'documents', 'diesel_purchases', 'login_history'];
      const stats = [];
      for (const table of tables) {
        try {
          const count = await db(table).count('* as c').first();
          stats.push({ table, rows: Number(count?.c || 0) });
        } catch { stats.push({ table, rows: 0 }); }
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch db stats' });
    }
  });

  // GET /admin/export-data — Export all data as JSON
  router.get('/admin/export-data', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      const data: any = {};
      const tables = ['vendors', 'purchase_orders', 'billing_records', 'invoices', 'vendor_services', 'sections', 'company_info'];
      for (const table of tables) {
        try { data[table] = await db(table).select('*'); } catch { data[table] = []; }
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=core-invoice-export.json');
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // GET /admin/storage-stats — Document storage info
  router.get('/admin/storage-stats', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      const documents = await db('documents').count('* as count').first();
      const poFiles = await db('purchase_orders').whereNotNull('file_path').where('file_path', '!=', '').count('* as count').first();

      // Count files in uploads directory
      const uploadsDir = path.resolve(__dirname, '../../data/uploads');
      let fileCount = 0;
      let totalSize = 0;
      try {
        const fs = await import('fs');
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          fileCount = files.length;
          for (const file of files) {
            try {
              const stat = fs.statSync(path.join(uploadsDir, file));
              totalSize += stat.size;
            } catch {}
          }
        }
      } catch {}

      res.json({
        documents: Number(documents?.count || 0),
        poFiles: Number(poFiles?.count || 0),
        uploadedFiles: fileCount,
        totalStorageBytes: totalSize,
        totalStorageMB: (totalSize / (1024 * 1024)).toFixed(2),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get storage stats' });
    }
  });

  // POST /admin/cleanup-duplicates — Remove duplicate POs and fix inconsistencies
  router.post('/admin/cleanup-duplicates', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      let removedDuplicates = 0;
      let fixedInconsistencies = 0;

      // 1. Find duplicate POs (same po_number + vendor_id) — keep latest, remove older
      const allPOs = await db('purchase_orders').select('id', 'po_number', 'vendor_id').orderBy('id', 'desc');
      const seen = new Map<string, number>();
      const toDelete: number[] = [];
      for (const po of allPOs) {
        const key = `${po.po_number}_${po.vendor_id}`;
        if (seen.has(key)) {
          toDelete.push(po.id); // older duplicate
        } else {
          seen.set(key, po.id);
        }
      }
      if (toDelete.length > 0) {
        await db('purchase_orders').whereIn('id', toDelete).del();
        removedDuplicates = toDelete.length;
      }

      // 2. Fix POs without is_expired flag where date has passed
      const today = new Date().toISOString().split('T')[0];
      const fixed = await db('purchase_orders')
        .whereNotNull('validity_date')
        .where('validity_date', '<', today)
        .where(function() { this.where('is_expired', false).orWhereNull('is_expired'); })
        .update({ is_expired: true });
      fixedInconsistencies += Number(fixed || 0);

      // 3. Fix POs without end date — mark expired
      const noDate = await db('purchase_orders')
        .where(function() { this.whereNull('validity_date').orWhere('validity_date', ''); })
        .where(function() { this.where('is_expired', false).orWhereNull('is_expired'); })
        .update({ is_expired: true });
      fixedInconsistencies += Number(noDate || 0);

      // 4. Fix users without role
      const usersFixed = await db('users').whereNull('role').orWhere('role', '').update({ role: 'guest' });
      fixedInconsistencies += Number(usersFixed || 0);

      // 5. Remove orphan billing records (vendor_id doesn't exist)
      const orphanBills = await db('billing_records')
        .whereNotIn('vendor_id', db('vendors').select('id'))
        .del();
      fixedInconsistencies += Number(orphanBills || 0);

      res.json({
        message: `Cleanup complete! Removed ${removedDuplicates} duplicate POs, fixed ${fixedInconsistencies} inconsistencies.`,
        removedDuplicates,
        fixedInconsistencies,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Cleanup failed: ' + error.message });
    }
  });

  // GET /admin/security-summary — Security overview
  router.get('/admin/security-summary', createAuthMiddleware(db), async (req: Request, res: Response) => {
    try {
      const currentUser = await db('users').where('id', (req as any).user.id).first();
      if (currentUser.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }

      const today = new Date().toISOString().split('T')[0];
      const todayLogins = await db('login_history').where('created_at', '>=', today).count('* as c').first();
      const todayFailed = await db('login_history').where('created_at', '>=', today).where('success', false).count('* as c').first();
      const totalLogins = await db('login_history').count('* as c').first();
      const totalFailed = await db('login_history').where('success', false).count('* as c').first();
      const lastLogin = await db('login_history').where('success', true).orderBy('created_at', 'desc').first();
      const lastFailed = await db('login_history').where('success', false).orderBy('created_at', 'desc').first();
      const inactiveUsers = await db('users').where('is_active', false).count('* as c').first();
      const unapprovedUsers = await db('users').where('is_approved', false).count('* as c').first();

      // Top failed login IDs (potential brute force)
      const topFailed = await db('login_history')
        .where('success', false)
        .groupBy('login_id')
        .select('login_id')
        .count('* as attempts')
        .orderBy('attempts', 'desc')
        .limit(5);

      res.json({
        today: { logins: Number(todayLogins?.c || 0), failed: Number(todayFailed?.c || 0) },
        total: { logins: Number(totalLogins?.c || 0), failed: Number(totalFailed?.c || 0) },
        lastLogin: lastLogin?.created_at || null,
        lastFailed: lastFailed?.created_at || null,
        inactiveUsers: Number(inactiveUsers?.c || 0),
        unapprovedUsers: Number(unapprovedUsers?.c || 0),
        topFailedLogins: topFailed,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get security summary' });
    }
  });

  return router;
}

// Default permissions based on role
function getDefaultPermissions(role: string) {
  const modules = ['dashboard', 'vendors', 'billing', 'po_reader', 'company', 'profile', 'notifications', 'users'];

  if (role === 'admin' || role === 'manager') {
    return modules.map(m => ({ module: m, can_view: true, can_create: true, can_edit: true, can_delete: true }));
  }
  if (role === 'associate') {
    return modules.map(m => ({
      module: m,
      can_view: true,
      can_create: !['users'].includes(m),
      can_edit: !['users'].includes(m),
      can_delete: false,
    }));
  }
  return modules.map(m => ({
    module: m,
    can_view: ['dashboard', 'vendors', 'billing', 'notifications', 'profile'].includes(m),
    can_create: false,
    can_edit: m === 'profile',
    can_delete: false,
  }));
}

// HTML page for email verification result
function verificationPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Email Verification - Core-Invoice</title></head>
<body style="font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a2e;margin:0;">
<div style="background:white;border-radius:16px;padding:40px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
  <div style="font-size:48px;margin-bottom:16px;">${success ? '✅' : '❌'}</div>
  <h2 style="color:#1a1a2e;margin-bottom:12px;">${success ? 'Email Verified!' : 'Verification Failed'}</h2>
  <p style="color:#666;line-height:1.5;">${message}</p>
  <a href="/" style="display:inline-block;margin-top:20px;background:#f59e0b;color:#1a1a2e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Go to App</a>
</div>
</body></html>`;
}
