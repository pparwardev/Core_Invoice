import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Knex } from 'knex';

const JWT_SECRET = process.env.JWT_SECRET || 'core-invoice-secret-key-2025';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export function createAuthMiddleware(db: Knex) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
      const user = await db('users').where('id', decoded.userId).first();
      if (!user) { res.status(401).json({ error: 'User not found' }); return; }

      req.user = { id: user.id, name: user.name, email: user.email };
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
