CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'sales_rep');
CREATE TYPE visit_status AS ENUM ('planned', 'completed', 'cancelled', 'follow_up');
CREATE TYPE visit_item_kind AS ENUM ('sample', 'order');

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  assigned_product_id uuid REFERENCES products(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rep_requires_product CHECK (role = 'admin' OR assigned_product_id IS NOT NULL)
);
CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  clinic_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, clinic_name, phone)
);
CREATE INDEX doctors_search_idx ON doctors USING gin (to_tsvector('simple', name || ' ' || clinic_name || ' ' || city));
CREATE TABLE targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_value integer NOT NULL CHECK (target_value >= 0),
  achieved_value integer NOT NULL DEFAULT 0 CHECK (achieved_value >= 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  UNIQUE(user_id, product_id, period_start)
);
CREATE TABLE visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctors(id),
  sales_rep_id uuid NOT NULL REFERENCES users(id),
  visited_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL CHECK (length(trim(notes)) >= 10),
  status visit_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visits_rep_date_idx ON visits(sales_rep_id, visited_at DESC);
CREATE TABLE visit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  kind visit_item_kind NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE login_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);
