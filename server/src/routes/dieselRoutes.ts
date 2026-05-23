import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

export function createDieselRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // List all diesel purchases
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { month, year } = req.query;
      let query = db('diesel_purchases').orderBy('purchase_date', 'desc');
      if (month) query = query.where('month', month);
      if (year) query = query.where('year', year);
      const purchases = await query;
      res.json(purchases);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch diesel purchases' });
    }
  });

  // Get monthly weighted average
  router.get('/average', async (req: Request, res: Response) => {
    try {
      const { month, year } = req.query;
      if (!month || !year) { res.status(400).json({ error: 'month and year required' }); return; }

      const result = await db('diesel_purchases')
        .where({ month, year })
        .select(
          db.raw('SUM(liters) as totalLiters'),
          db.raw('SUM(total_cost) as totalCost')
        ).first();

      const totalLiters = Number(result?.totalLiters || 0);
      const totalCost = Number(result?.totalCost || 0);
      const weightedAvgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;

      res.json({ month: Number(month), year: Number(year), totalLiters, totalCost, weightedAvgPrice });
    } catch (error) {
      res.status(500).json({ error: 'Failed to calculate average' });
    }
  });

  // Add diesel purchase
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { purchaseDate, liters, pricePerLiter, billNumber, pumpName } = req.body;
      if (!purchaseDate || !liters || !pricePerLiter) {
        res.status(400).json({ error: 'purchaseDate, liters, pricePerLiter required' }); return;
      }
      const totalCost = liters * pricePerLiter;
      const date = new Date(purchaseDate);
      const id_res = await db('diesel_purchases').insert({
        purchase_date: purchaseDate, liters, price_per_liter: pricePerLiter,
        total_cost: totalCost, bill_number: billNumber, pump_name: pumpName,
        month: date.getMonth() + 1, year: date.getFullYear(),
      }).returning("id"); const id = typeof id_res[0] === "object" ? (id_res[0] as any).id : id_res[0];
      res.status(201).json({ id, totalCost });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add diesel purchase' });
    }
  });

  // Update
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { purchaseDate, liters, pricePerLiter, billNumber, pumpName } = req.body;
      const totalCost = liters * pricePerLiter;
      const date = new Date(purchaseDate);
      await db('diesel_purchases').where('id', req.params.id).update({
        purchase_date: purchaseDate, liters, price_per_liter: pricePerLiter,
        total_cost: totalCost, bill_number: billNumber, pump_name: pumpName,
        month: date.getMonth() + 1, year: date.getFullYear(),
      });
      res.json({ message: 'Updated' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update' });
    }
  });

  // Delete
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await db('diesel_purchases').where('id', req.params.id).del();
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  return router;
}
