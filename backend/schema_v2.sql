-- ==========================================================
-- Nomoosh v2 — Additional schema for table ordering system
-- Run this in the Supabase SQL Editor AFTER schema.sql
-- ==========================================================

-- 1. Staff members (owner, chef, waiter)
CREATE TABLE IF NOT EXISTS staff (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id INT NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    name          VARCHAR(100) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'chef', 'waiter')),
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(restaurant_id, email),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- 2. Add columns to restaurant_tables (safe IF NOT EXISTS)
DO $$ BEGIN
    ALTER TABLE restaurant_tables ADD COLUMN status VARCHAR(20) DEFAULT 'inactive';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE restaurant_tables ADD COLUMN qr_token TEXT UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE restaurant_tables ADD COLUMN capacity INT DEFAULT 4;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Fill qr_token for any existing rows
UPDATE restaurant_tables SET qr_token = uuid_generate_v4()::TEXT WHERE qr_token IS NULL;

-- 3. Add columns to sessions
DO $$ BEGIN
    ALTER TABLE sessions ADD COLUMN chef_eta_minutes INT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sessions ADD COLUMN chef_eta_set_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sessions ADD COLUMN payment_lock_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Add columns to orders
DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN table_number VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE orders ADD COLUMN restaurant_id INT REFERENCES restaurants(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Make payments.participant_id nullable (guests may not have a tracked participant)
ALTER TABLE payments ALTER COLUMN participant_id DROP NOT NULL;
