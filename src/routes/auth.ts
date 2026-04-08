import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';

const router = Router();

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via Africa's Talking (or console in dev)
async function sendOTP(phone: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === 'development' || !process.env.AT_API_KEY || process.env.AT_API_KEY === 'your-africastalking-api-key') {
    console.log(`📱 OTP for ${phone}: ${code}`);
    return;
  }

  // Africa's Talking SMS
  const params = new URLSearchParams({
    username: process.env.AT_USERNAME || 'sandbox',
    to: phone,
    message: `Your AgriConnect verification code is: ${code}. Valid for 10 minutes. Do not share this code.`,
    from: 'AgriConn',
  });

  await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      'apiKey': process.env.AT_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });
}

// POST /auth/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    // Invalidate old OTPs for this phone
    await pool.query('UPDATE otp_codes SET used = true WHERE phone = $1', [phone]);

    // Store new OTP
    await pool.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
      [phone, code, expiresAt]
    );

    await sendOTP(phone, code);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req: Request, res: Response) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code required' });

  try {
    const result = await pool.query(
      'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [phone, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET used = true WHERE id = $1', [result.rows[0].id]);

    // Check if farmer exists
    const farmer = await pool.query('SELECT * FROM farmers WHERE phone = $1', [phone]);

    if (farmer.rows.length > 0) {
      // Existing farmer — return token
      const token = jwt.sign({ farmerId: farmer.rows[0].id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
      return res.json({ success: true, token, farmer: farmer.rows[0], isNewUser: false });
    }

    // New farmer — return temp token for registration
    const tempToken = jwt.sign({ phone, isTemp: true }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    res.json({ success: true, tempToken, isNewUser: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { tempToken, fullName, farmName, phone, momoNumber, location, region, acres, bio } = req.body;

  try {
    // Verify temp token
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'secret') as { phone: string; isTemp: boolean };
    if (!decoded.isTemp) return res.status(400).json({ error: 'Invalid registration token' });

    // Create farmer
    const result = await pool.query(
      `INSERT INTO farmers (full_name, farm_name, phone, momo_number, location, region, acres, bio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [fullName, farmName, decoded.phone || phone, momoNumber, location, region, acres || null, bio || null]
    );

    const farmer = result.rows[0];
    const token = jwt.sign({ farmerId: farmer.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });

    res.status(201).json({ success: true, token, farmer });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Phone number already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
