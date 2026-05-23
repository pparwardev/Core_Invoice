import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

export function createCompanyRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  router.get('/', async (req: Request, res: Response) => {
    try {
      const company = await db('company_info').first();
      res.json(company || {});
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch company info' });
    }
  });

  router.put('/', async (req: Request, res: Response) => {
    try {
      const existing = await db('company_info').first();
      const data = {
        name: req.body.name, gstin: req.body.gstin, pan: req.body.pan,
        state: req.body.state, state_code: req.body.stateCode,
        address: req.body.address, pincode: req.body.pincode,
        phone: req.body.phone, email: req.body.email,
        hsn_vehicle: req.body.hsnVehicle, hsn_food: req.body.hsnFood,
        hsn_service: req.body.hsnService, updated_at: db.fn.now(),
      };
      if (existing) {
        await db('company_info').where('id', existing.id).update(data);
      } else {
        await db('company_info').insert(data);
      }
      res.json({ message: 'Company info updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update company info' });
    }
  });

  return router;
}
