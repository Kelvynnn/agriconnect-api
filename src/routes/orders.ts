import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /orders — farmer's orders
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  try {
    const query = status
      ? 'SELECT * FROM orders WHERE farmer_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM orders WHERE farmer_id = $1 ORDER BY created_at DESC';
    const params = status ? [req.farmerId, status] : [req.farmerId];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /orders/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND farmer_id = $2',
      [req.params.id, req.farmerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /orders/:id/status — update order status
router.put('/:id/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'in_transit', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Get current order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND farmer_id = $2',
      [req.params.id, req.farmerId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];

    // Update order status
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    // If delivered, update reserved_kg on listing and farmer total_sales
    if (status === 'delivered') {
      await pool.query(
        'UPDATE listings SET reserved_kg = reserved_kg - $1 WHERE id = $2',
        [order.quantity_kg, order.listing_id]
      );
      await pool.query(
        'UPDATE farmers SET total_sales = total_sales + 1 WHERE id = $1',
        [req.farmerId]
      );

      // Create notification
      await pool.query(
        `INSERT INTO notifications (farmer_id, title, body, type)
         VALUES ($1, $2, $3, $4)`,
        [req.farmerId, 'Payment Released 💰', `₵${order.total_amount} has been released to your Mobile Money for ${order.crop_name} order.`, 'payment']
      );
    }

    // Create notification for status change
    if (status === 'confirmed') {
      await pool.query(
        `INSERT INTO notifications (farmer_id, title, body, type)
         VALUES ($1, $2, $3, $4)`,
        [req.farmerId, 'Order Confirmed ✅', `You confirmed order from ${order.buyer_name} for ${order.quantity_kg}kg ${order.crop_name}.`, 'order']
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// GET /orders/earnings/summary
router.get('/earnings/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const [total, weekly, monthly] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE farmer_id = $1 AND status = $2', [req.farmerId, 'delivered']),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE farmer_id = $1 AND status = $2 AND created_at >= NOW() - INTERVAL '7 days'`, [req.farmerId, 'delivered']),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE farmer_id = $1 AND status = $2 AND created_at >= NOW() - INTERVAL '30 days'`, [req.farmerId, 'delivered']),
    ]);

    res.json({
      total: parseFloat(total.rows[0].total),
      thisWeek: parseFloat(weekly.rows[0].total),
      lastMonth: parseFloat(monthly.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

export default router;
