-- AgriConnect Database Schema
-- Run this on your PostgreSQL database

-- Farmers (users)
CREATE TABLE IF NOT EXISTS farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(100) NOT NULL,
  farm_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  momo_number VARCHAR(20),
  location VARCHAR(100),
  region VARCHAR(50),
  acres DECIMAL(10,2),
  bio TEXT,
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_sales INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  profile_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTP verification
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crop listings
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  crop_name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10),
  category VARCHAR(50),
  quantity_kg DECIMAL(10,2) NOT NULL,
  reserved_kg DECIMAL(10,2) DEFAULT 0,
  price_per_kg DECIMAL(10,2) NOT NULL,
  min_order_kg DECIMAL(10,2) DEFAULT 1,
  harvest_date DATE,
  listing_type VARCHAR(20) CHECK (listing_type IN ('available', 'pre_order')) DEFAULT 'available',
  status VARCHAR(20) CHECK (status IN ('active', 'sold_out', 'cancelled')) DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  farmer_id UUID REFERENCES farmers(id),
  buyer_name VARCHAR(100) NOT NULL,
  buyer_phone VARCHAR(20) NOT NULL,
  buyer_type VARCHAR(20) CHECK (buyer_type IN ('household', 'restaurant')) DEFAULT 'household',
  buyer_address TEXT,
  crop_name VARCHAR(100) NOT NULL,
  quantity_kg DECIMAL(10,2) NOT NULL,
  price_per_kg DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending','confirmed','in_transit','delivered','cancelled')) DEFAULT 'pending',
  payment_status VARCHAR(20) CHECK (payment_status IN ('pending','held','released','refunded')) DEFAULT 'pending',
  paystack_reference VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50),
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_farmer ON listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_farmer ON notifications(farmer_id);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);
