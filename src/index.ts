import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runMigration } from './db/migrate';

import authRoutes from './routes/auth';
import farmerRoutes from './routes/farmers';
import listingRoutes from './routes/listings';
import orderRoutes from './routes/orders';
import notificationRoutes from './routes/notifications';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'AgriConnect API', country: 'Ghana', version: '1.0.0' });
});

// One-time setup endpoint to create tables
app.get('/setup', async (_, res) => {
  try {
    await runMigration();
    res.json({ success: true, message: 'Database tables created successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/auth', authRoutes);
app.use('/farmers', farmerRoutes);
app.use('/listings', listingRoutes);
app.use('/orders', orderRoutes);
app.use('/notifications', notificationRoutes);

app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

async function start() {
  await runMigration();
  app.listen(PORT, () => {
    console.log(`🌾 AgriConnect API running on port ${PORT}`);
    console.log(`🇬🇭 Ghana Farmer Platform`);
  });
}

start();
