import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';

const router = Router();

// ── Customer Auth middleware ──────────────────────────────────────────────────
interface CustomerRequest extends Request {
  customerId?: string;
}

function customerAuth(req: CustomerRequest, res: Response, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { customerId: string };
    req.customerId = decoded.customerId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Customer OTP Auth ─────────────────────────────────────────────────────────

// POST /customer/auth/send-otp
router.post('/auth/send-otp', async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await pool.query('UPDATE otp_codes SET used = true WHERE phone = $1', [phone]);
    await pool.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
      [phone, code, expiresAt]
    );

    const hasATKey = process.env.AT_API_KEY && process.env.AT_API_KEY !== 'your-africastalking-api-key';
    if (!hasATKey) {
      console.log(`📱 Customer OTP for ${phone}: ${code}`);
    } else {
      const params = new URLSearchParams({
        username: process.env.AT_USERNAME || 'sandbox',
        to: phone,
        message: `Your AgriConnect verification code is: ${code}. Valid for 10 minutes.`,
        from: 'AgriConn',
      });
      await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey: process.env.AT_API_KEY as string,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send OTP', detail: err?.message });
  }
});

// POST /customer/auth/verify-otp
router.post('/auth/verify-otp', async (req: Request, res: Response) => {
  const { phone, code, name, buyerType } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  try {
    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [phone, code]
    );
    if (otpResult.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired code' });

    await pool.query('UPDATE otp_codes SET used = true WHERE id = $1', [otpResult.rows[0].id]);

    // Check if customer exists
    let customer = await pool.query('SELECT * FROM customers WHERE phone = $1', [phone]);

    if (customer.rows.length === 0) {
      // Auto-create customer on first login
      const displayName = name || `Customer ${phone.slice(-4)}`;
      const type = buyerType || 'household';
      const inserted = await pool.query(
        'INSERT INTO customers (name, phone, buyer_type) VALUES ($1, $2, $3) RETURNING *',
        [displayName, phone, type]
      );
      customer = { rows: [inserted.rows[0]] } as any;
    }

    const token = jwt.sign(
      { customerId: customer.rows[0].id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.json({ success: true, token, customer: customer.rows[0], isNewUser: customer.rows[0].name?.startsWith('Customer ') });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed', detail: err?.message });
  }
});

// PUT /customer/profile
router.put('/profile', customerAuth, async (req: CustomerRequest, res: Response) => {
  const { name, buyerType, location, address } = req.body;
  try {
    const result = await pool.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        buyer_type = COALESCE($2, buyer_type),
        location = COALESCE($3, location),
        address = COALESCE($4, address),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, buyerType, location, address, req.customerId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /customer/profile
router.get('/profile', customerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.customerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── Public Listings (browse marketplace) ─────────────────────────────────────

// GET /customer/listings — all active listings with farmer info
router.get('/listings', async (req: Request, res: Response) => {
  const { category, search, sort } = req.query;
  try {
    let query = `
      SELECT l.*, f.full_name as farmer_name, f.farm_name, f.location as farmer_location,
             f.rating as farmer_rating, f.verified as farmer_verified, f.phone as farmer_phone
      FROM listings l
      JOIN farmers f ON l.farmer_id = f.id
      WHERE l.status = 'active'
    `;
    const params: any[] = [];

    if (category && category !== 'All') {
      params.push(category);
      query += ` AND l.category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (l.crop_name ILIKE $${params.length} OR f.farm_name ILIKE $${params.length} OR f.location ILIKE $${params.length})`;
    }

    if (sort === 'price_asc') query += ' ORDER BY l.price_per_kg ASC';
    else if (sort === 'price_desc') query += ' ORDER BY l.price_per_kg DESC';
    else if (sort === 'newest') query += ' ORDER BY l.created_at DESC';
    else query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// GET /customer/listings/:id — single listing detail
router.get('/listings/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT l.*, f.full_name as farmer_name, f.farm_name, f.location as farmer_location,
              f.rating as farmer_rating, f.verified as farmer_verified, f.phone as farmer_phone,
              f.bio as farmer_bio, f.acres as farmer_acres
       FROM listings l
       JOIN farmers f ON l.farmer_id = f.id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// ── Orders ────────────────────────────────────────────────────────────────────

// POST /customer/orders — place an order
router.post('/orders', customerAuth, async (req: CustomerRequest, res: Response) => {
  const { listingId, quantityKg, notes, deliveryAddress } = req.body;

  if (!listingId || !quantityKg) {
    return res.status(400).json({ error: 'Listing ID and quantity are required' });
  }

  try {
    // Get customer info
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [req.customerId]);
    if (customerResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = customerResult.rows[0];

    // Get listing info
    const listingResult = await pool.query(
      'SELECT l.*, f.id as farmer_id FROM listings l JOIN farmers f ON l.farmer_id = f.id WHERE l.id = $1 AND l.status = $2',
      [listingId, 'active']
    );
    if (listingResult.rows.length === 0) return res.status(404).json({ error: 'Listing not available' });
    const listing = listingResult.rows[0];

    // Check minimum order
    if (quantityKg < listing.min_order_kg) {
      return res.status(400).json({ error: `Minimum order is ${listing.min_order_kg}kg` });
    }

    // Check available quantity
    const available = listing.quantity_kg - listing.reserved_kg;
    if (quantityKg > available) {
      return res.status(400).json({ error: `Only ${available}kg available` });
    }

    const totalAmount = quantityKg * listing.price_per_kg;

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders (listing_id, farmer_id, buyer_name, buyer_phone, buyer_type, buyer_address, crop_name, quantity_kg, price_per_kg, total_amount, notes, customer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        listingId, listing.farmer_id, customer.name, customer.phone,
        customer.buyer_type, deliveryAddress || customer.address,
        listing.crop_name, quantityKg, listing.price_per_kg,
        totalAmount, notes || null, req.customerId,
      ]
    );

    // Reserve the quantity
    await pool.query(
      'UPDATE listings SET reserved_kg = reserved_kg + $1 WHERE id = $2',
      [quantityKg, listingId]
    );

    // Notify the farmer
    await pool.query(
      `INSERT INTO notifications (farmer_id, title, body, type)
       VALUES ($1, $2, $3, $4)`,
      [
        listing.farmer_id,
        `New Order 📦`,
        `${customer.name} ordered ${quantityKg}kg of ${listing.crop_name} for ₵${totalAmount.toFixed(2)}`,
        'order',
      ]
    );

    res.status(201).json(orderResult.rows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place order', detail: err?.message });
  }
});

// GET /customer/orders — customer's own orders
router.get('/orders', customerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT o.*, f.full_name as farmer_name, f.farm_name, f.phone as farmer_phone
       FROM orders o
       JOIN farmers f ON o.farmer_id = f.id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC`,
      [req.customerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /customer/orders/:id
router.get('/orders/:id', customerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT o.*, f.full_name as farmer_name, f.farm_name, f.phone as farmer_phone,
              f.location as farmer_location, f.momo_number as farmer_momo
       FROM orders o
       JOIN farmers f ON o.farmer_id = f.id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [req.params.id, req.customerId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── Market Prices (public) ────────────────────────────────────────────────────

// GET /customer/market — aggregated market prices from live listings
router.get('/market', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT crop_name, emoji,
             ROUND(AVG(price_per_kg)::numeric, 2) as avg_price,
             MIN(price_per_kg) as min_price,
             MAX(price_per_kg) as max_price,
             COUNT(*) as listing_count,
             SUM(quantity_kg - reserved_kg) as available_kg
      FROM listings
      WHERE status = 'active'
      GROUP BY crop_name, emoji
      ORDER BY listing_count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

export default router;
