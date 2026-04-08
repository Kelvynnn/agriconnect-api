import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /listings — farmer's own listings
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM listings WHERE farmer_id = $1 ORDER BY created_at DESC',
      [req.farmerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// POST /listings — create new listing
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { cropName, emoji, category, quantityKg, pricePerKg, minOrderKg, harvestDate, listingType, description } = req.body;

  if (!cropName || !quantityKg || !pricePerKg) {
    return res.status(400).json({ error: 'Crop name, quantity and price are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO listings (farmer_id, crop_name, emoji, category, quantity_kg, price_per_kg, min_order_kg, harvest_date, listing_type, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.farmerId, cropName, emoji, category, quantityKg, pricePerKg, minOrderKg || 1, harvestDate, listingType || 'available', description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// PUT /listings/:id — update listing
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { quantityKg, pricePerKg, minOrderKg, harvestDate, listingType, status, description } = req.body;

  try {
    const result = await pool.query(
      `UPDATE listings SET
        quantity_kg = COALESCE($1, quantity_kg),
        price_per_kg = COALESCE($2, price_per_kg),
        min_order_kg = COALESCE($3, min_order_kg),
        harvest_date = COALESCE($4, harvest_date),
        listing_type = COALESCE($5, listing_type),
        status = COALESCE($6, status),
        description = COALESCE($7, description),
        updated_at = NOW()
       WHERE id = $8 AND farmer_id = $9 RETURNING *`,
      [quantityKg, pricePerKg, minOrderKg, harvestDate, listingType, status, description, req.params.id, req.farmerId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// DELETE /listings/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      'UPDATE listings SET status = $1 WHERE id = $2 AND farmer_id = $3',
      ['cancelled', req.params.id, req.farmerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

export default router;
