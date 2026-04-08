import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /notifications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.farmerId]
    );
    const unreadCount = result.rows.filter(n => !n.read).length;
    res.json({ notifications: result.rows, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /notifications/read-all
router.put('/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE farmer_id = $1', [req.farmerId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// PUT /notifications/:id/read
router.put('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND farmer_id = $2',
      [req.params.id, req.farmerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

export default router;
