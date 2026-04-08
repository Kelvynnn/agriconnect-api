import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import farmerRoutes from './routes/farmers';
import listingRoutes from './routes/listings';
import orderRoutes from './routes/orders';
import notificationRoutes from './routes/notifications';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10mb for base64 images

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'AgriConnect API', country: 'Ghana', version: '1.0.0' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/farmers', farmerRoutes);
app.use('/listings', listingRoutes);
app.use('/orders', orderRoutes);
app.use('/notifications', notificationRoutes);

// 404
app.use((_, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => {
  console.log(`🌾 AgriConnect API running on port ${PORT}`);
  console.log(`🇬🇭 Ghana Farmer Platform`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
});

export default app;
