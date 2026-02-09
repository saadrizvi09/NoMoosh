-- ==========================================================
-- Nomoosh — Supabase-compatible PostgreSQL schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query)
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================
-- 1. ONBOARDING / MASTER DATA
-- ==========================================================

-- Accounts (Restaurant Owner / Admin)
CREATE TABLE IF NOT EXISTS accounts (
    id            SERIAL PRIMARY KEY,
    supabase_uid  TEXT UNIQUE,                     -- links to auth.users.id
    name          VARCHAR(25) NOT NULL,
    email         VARCHAR(255) UNIQUE,
    mob_number    VARCHAR(16) UNIQUE,
    profile_pic   TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Restaurant Location
CREATE TABLE IF NOT EXISTS rest_location (
    id        SERIAL PRIMARY KEY,
    street    TEXT NOT NULL,
    locality  TEXT NOT NULL,
    city      TEXT NOT NULL,
    pincode   TEXT NOT NULL,
    landmark  TEXT,
    latitude  TEXT NOT NULL DEFAULT '0',
    longitude TEXT NOT NULL DEFAULT '0'
);

-- Bank Details
CREATE TABLE IF NOT EXISTS bank_details (
    id         SERIAL PRIMARY KEY,
    pan        TEXT,
    bank_name  TEXT,
    account_holder TEXT,
    account_no TEXT,
    ifsc       TEXT,
    upi        TEXT
);

-- Restaurants (Master)
CREATE TABLE IF NOT EXISTS restaurants (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    accounts_id         INT NOT NULL UNIQUE,
    location_id         INT NOT NULL UNIQUE,
    bank_id             INT UNIQUE,
    rating              REAL,
    rating_by_no_of_people INT,
    mob_number          VARCHAR(16) NOT NULL DEFAULT '',
    description         TEXT,

    FOREIGN KEY (accounts_id) REFERENCES accounts(id),
    FOREIGN KEY (location_id) REFERENCES rest_location(id),
    FOREIGN KEY (bank_id)     REFERENCES bank_details(id)
);

-- Cuisines (pre-seeded below)
CREATE TABLE IF NOT EXISTS cuisines (
    id      SERIAL PRIMARY KEY,
    cuisine VARCHAR(50) NOT NULL UNIQUE
);

-- Restaurant ↔ Cuisines
CREATE TABLE IF NOT EXISTS rest_cuisines (
    restaurant_id INT NOT NULL,
    cuisine_id    INT NOT NULL,
    PRIMARY KEY (restaurant_id, cuisine_id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    FOREIGN KEY (cuisine_id)    REFERENCES cuisines(id)
);

-- Menu
CREATE TABLE IF NOT EXISTS menu (
    id                       SERIAL PRIMARY KEY,
    restaurant_id            INT NOT NULL,
    dish_name                VARCHAR(100) NOT NULL,
    type_maincourse          TEXT,
    quantity                 TEXT,
    price                    INT NOT NULL DEFAULT 0,
    category_veg             BOOLEAN,
    availability             BOOLEAN DEFAULT TRUE NOT NULL,
    preperation_time         INTERVAL,
    image_link               TEXT,
    description              TEXT,
    customizability          BOOLEAN DEFAULT FALSE NOT NULL,
    order_freq               TEXT,
    serving_for_no_of_people INT,
    rating                   REAL,
    rating_by_no_of_people   INT,
    cuisine                  VARCHAR(50),
    category                 TEXT,
    variant_name             TEXT DEFAULT 'Regular',

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Restaurant Timing (open/close per day per shift)
CREATE TABLE IF NOT EXISTS rest_timing (
    id            SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL,
    day           VARCHAR(9) NOT NULL,
    open_time     TIME NOT NULL,
    close_time    TIME NOT NULL,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Restaurant Media
CREATE TABLE IF NOT EXISTS rest_media (
    id            SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL,
    image_link    TEXT NOT NULL,
    exterior      BOOLEAN DEFAULT FALSE NOT NULL,
    interior      BOOLEAN DEFAULT FALSE NOT NULL,
    lavatory      BOOLEAN DEFAULT FALSE NOT NULL,
    kitchen       BOOLEAN DEFAULT FALSE NOT NULL,
    video         BOOLEAN DEFAULT FALSE NOT NULL,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Customer Feedback
CREATE TABLE IF NOT EXISTS customer_feedback (
    id             SERIAL PRIMARY KEY,
    customer_id    INT NOT NULL,
    restaurant_id  INT NOT NULL,
    food           INT CHECK (food BETWEEN 1 AND 5),
    staff_behavior INT CHECK (staff_behavior BETWEEN 1 AND 5),
    hygiene        INT CHECK (hygiene BETWEEN 1 AND 5),
    optional       TEXT,

    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- ==========================================================
-- 2. TEMP / DRAFT TABLES (ONBOARDING FLOW)
-- ==========================================================

CREATE TABLE IF NOT EXISTS temp (
    user_id         INT PRIMARY KEY,
    restaurant_name VARCHAR(100),
    owner_name      VARCHAR(25),
    owner_email     VARCHAR(255),
    owner_mobile    VARCHAR(16),
    street          TEXT,
    locality        TEXT,
    city            TEXT,
    pincode         TEXT,
    landmark        TEXT,
    latitude        TEXT,
    longitude       TEXT,
    bank_name       TEXT,
    account_no      TEXT,
    ifsc            TEXT,
    upi             TEXT,
    rest_mob_number VARCHAR(16),
    description     TEXT,
    pan             TEXT,
    account_holder  TEXT,

    FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS temp_media (
    id       SERIAL PRIMARY KEY,
    user_id  INT NOT NULL,
    file_link TEXT NOT NULL,
    exterior BOOLEAN DEFAULT FALSE NOT NULL,
    interior BOOLEAN DEFAULT FALSE NOT NULL,
    kitchen  BOOLEAN DEFAULT FALSE NOT NULL,
    menu     BOOLEAN DEFAULT FALSE NOT NULL,
    video    BOOLEAN DEFAULT FALSE NOT NULL,

    FOREIGN KEY (user_id) REFERENCES temp(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS temp_menu (
    id                       SERIAL PRIMARY KEY,
    user_id                  INT NOT NULL,
    dish_name                VARCHAR(100) NOT NULL,
    type_maincourse          TEXT,
    quantity                 TEXT,
    price                    INT NOT NULL DEFAULT 0,
    category_veg             BOOLEAN,
    availability             BOOLEAN DEFAULT TRUE NOT NULL,
    preperation_time         INTERVAL,
    image_link               TEXT,
    description              TEXT,
    customizability          BOOLEAN DEFAULT FALSE NOT NULL,
    serving_for_no_of_people INT,
    cuisine                  VARCHAR(50),
    category                 TEXT,
    variant_name             TEXT DEFAULT 'Regular',

    FOREIGN KEY (user_id) REFERENCES temp(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS temp_rest_timing (
    id       SERIAL PRIMARY KEY,
    user_id  INT NOT NULL,
    day      VARCHAR(9) NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,

    FOREIGN KEY (user_id) REFERENCES temp(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS temp_rest_cuisines (
    user_id    INT NOT NULL,
    cuisine_id INT NOT NULL,
    PRIMARY KEY (user_id, cuisine_id),
    FOREIGN KEY (user_id)    REFERENCES temp(user_id) ON DELETE CASCADE,
    FOREIGN KEY (cuisine_id) REFERENCES cuisines(id)
);

-- ==========================================================
-- 3. CORE APPLICATION (TRANSACTIONAL)
-- ==========================================================

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id INT NOT NULL,
    number        VARCHAR(50) NOT NULL,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TYPE session_status AS ENUM ('active','payment_pending','completed','expired');

CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id      UUID NOT NULL,
    restaurant_id INT NOT NULL,
    status        session_status DEFAULT 'active',
    created_at    TIMESTAMPTZ DEFAULT now(),
    expires_at    TIMESTAMPTZ,
    payment_lock  BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (table_id)      REFERENCES restaurant_tables(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE TYPE participant_role AS ENUM ('guest','host');

CREATE TABLE IF NOT EXISTS participants (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id         UUID NOT NULL,
    device_fingerprint VARCHAR(255),
    joined_at          TIMESTAMPTZ DEFAULT now(),
    last_active_at     TIMESTAMPTZ DEFAULT now(),
    role               participant_role DEFAULT 'guest',
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS carts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL UNIQUE,
    version    INT DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT now(),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS cart_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id      UUID NOT NULL,
    menu_item_id INT NOT NULL,
    quantity     INT DEFAULT 1,
    added_by     UUID,
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    FOREIGN KEY (cart_id)      REFERENCES carts(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu(id),
    FOREIGN KEY (added_by)     REFERENCES participants(id)
);

CREATE TYPE order_status AS ENUM ('pending','paid','failed');

CREATE TABLE IF NOT EXISTS orders (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     UUID NOT NULL,
    total_amount   DECIMAL(10,2) NOT NULL,
    status         order_status DEFAULT 'pending',
    transaction_id VARCHAR(255),
    created_at     TIMESTAMPTZ DEFAULT now(),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id      UUID NOT NULL,
    menu_item_id  INT NOT NULL,
    quantity      INT NOT NULL,
    price_at_time DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu(id)
);

-- ==========================================================
-- 4. PAYMENTS
-- ==========================================================

CREATE TYPE payment_status AS ENUM ('initiated','success','failed','refunded');
CREATE TYPE payment_method AS ENUM ('upi','card','wallet','net_banking','cash');

CREATE TABLE IF NOT EXISTS payments (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id               UUID NOT NULL,
    participant_id         UUID NOT NULL,
    amount                 DECIMAL(10,2) NOT NULL,
    method                 payment_method NOT NULL,
    status                 payment_status DEFAULT 'initiated',
    gateway_transaction_id VARCHAR(255),
    gateway_response       JSONB,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now(),
    FOREIGN KEY (order_id)       REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- ==========================================================
-- 5. SEED: Cuisines
-- ==========================================================
INSERT INTO cuisines (cuisine) VALUES
  ('North Indian'),('South Indian'),('Chinese'),('Fast Food'),('Biryani'),
  ('Pizza'),('Bakery'),('Street Food'),('Burger'),('Mughlai'),
  ('Momos'),('Sandwich'),('Fresh Veggie'),('Kebab'),('Ice Cream'),
  ('Cafe'),('Healthy Food'),('Italian'),('Continental'),('Lebanese'),
  ('Salad'),('Shawarma'),('Gujarati'),('Andhra'),('Waffle'),
  ('Coffee'),('Rajasthani'),('Wraps'),('Mexican'),('Bengali'),
  ('Sushi'),('Lucknowi'),('Goan'),('Assamese'),('American'),
  ('Mandi'),('Chettinad'),('Mishti'),('Bar Food'),('Malwani'),
  ('Odia'),('Japanese'),('Finger Food'),('Korean'),('North Eastern'),
  ('Thai'),('Steak'),('Frozen Yogurt'),('Panini'),('Parsi'),
  ('Sichuan'),('Iranian'),('Grilled Chicken'),('French'),('Raw Meats'),
  ('Drinks Only'),('Vietnamese'),('Liquor'),('Greek'),('Himachali'),
  ('Bohri'),('Garhwali'),('Cantonese'),('Malaysian'),('Belgian'),
  ('British'),('African'),('Spanish'),('Manipur'),('Egyptian')
ON CONFLICT (cuisine) DO NOTHING;

-- ==========================================================
-- 6. SUPABASE STORAGE (run these manually in Dashboard)
-- ==========================================================
-- 1. Go to Supabase Dashboard → Storage → Create bucket
--    Name: restaurant-media   |  Public: ON
--
-- 2. Add a Storage Policy (allow uploads via service key):
--    INSERT policy: Allowed for service_role
--    SELECT policy: Allowed for everyone (public read)
--
-- These are NOT SQL commands — do them through the Dashboard UI.
