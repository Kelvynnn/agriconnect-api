import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /farmers/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM farmers WHERE id = $1', [req.farmerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Farmer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /farmers/me
router.put('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { fullName, farmName, momoNumber, location, region, acres, bio } = req.body;
  try {
    const result = await pool.query(
      `UPDATE farmers SET
        full_name = COALESCE($1, full_name),
        farm_name = COALESCE($2, farm_name),
        momo_number = COALESCE($3, momo_number),
        location = COALESCE($4, location),
        region = COALESCE($5, region),
        acres = COALESCE($6, acres),
        bio = COALESCE($7, bio),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [fullName, farmName, momoNumber, location, region, acres, bio, req.farmerId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /farmers/me/stats
router.get('/me/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const [listings, orders, earnings] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $1) as active FROM listings WHERE farmer_id = $2', ['active', req.farmerId]),
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $1) as pending FROM orders WHERE farmer_id = $2', ['pending', req.farmerId]),
      pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE farmer_id = $1 AND status = $2', [req.farmerId, 'delivered']),
    ]);

    const reservedKg = await pool.query(
      'SELECT COALESCE(SUM(reserved_kg), 0) as total FROM listings WHERE farmer_id = $1 AND status = $2',
      [req.farmerId, 'active']
    );

    res.json({
      listings: parseInt(listings.rows[0].total),
      activeListings: parseInt(listings.rows[0].active),
      orders: parseInt(orders.rows[0].total),
      pendingOrders: parseInt(orders.rows[0].pending),
      earnings: parseFloat(earnings.rows[0].total),
      reservedKg: parseFloat(reservedKg.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
