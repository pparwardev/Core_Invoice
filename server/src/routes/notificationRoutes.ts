import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

export function createNotificationRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // Get all notifications (latest 50) with unread count
  router.get('/', async (req: Request, res: Response) => {
    try {
      const notifications = await db('notifications')
        .orderBy('created_at', 'desc')
        .limit(50);

      const unreadCount = await db('notifications')
        .where('read', false)
        .count('* as count')
        .first();

      res.json({
        notifications,
        unreadCount: Number(unreadCount?.count || 0),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // Get unread count only
  router.get('/unread-count', async (req: Request, res: Response) => {
    try {
      const result = await db('notifications')
        .where('read', false)
        .count('* as count')
        .first();

      res.json({ unreadCount: Number(result?.count || 0) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  // Mark single notification as read
  router.put('/:id/read', async (req: Request, res: Response) => {
    try {
      await db('notifications').where('id', req.params.id).update({ read: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // Mark all notifications as read
  router.put('/read-all', async (req: Request, res: Response) => {
    try {
      await db('notifications').where('read', false).update({ read: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark all as read' });
    }
  });

  return router;
}
