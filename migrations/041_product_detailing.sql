-- Product detailing: richer product profile, multiple brochures per product, detailing sessions.
ALTER TABLE products ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#10484f';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_brochures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  mime text NOT NULL,
  data bytea NOT NULL,
  size_bytes int NOT NULL,
  pages int NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_brochures_product_idx ON product_brochures (product_id, sort_order);

-- Carry existing single brochures over (kept in products.* too for older screens).
INSERT INTO product_brochures (product_id, title, file_name, mime, data, size_bytes, pages)
SELECT p.id, 'البروشور الرئيسي', COALESCE(p.brochure_name, 'brochure'), COALESCE(p.brochure_mime, 'application/pdf'), p.brochure_data, length(p.brochure_data), 1
FROM products p
WHERE p.brochure_data IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_brochures b WHERE b.product_id = p.id);

-- Initial order = alphabetical
UPDATE products p SET sort_order = x.rn FROM (SELECT id, row_number() OVER (ORDER BY name) rn FROM products) x WHERE x.id = p.id AND p.sort_order = 0;

CREATE TABLE IF NOT EXISTS detailing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detailing_sessions_rep_idx ON detailing_sessions (rep_id, started_at DESC);
CREATE INDEX IF NOT EXISTS detailing_sessions_doctor_idx ON detailing_sessions (doctor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS detailing_views (
  session_id uuid NOT NULL REFERENCES detailing_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  brochure_id uuid REFERENCES product_brochures(id) ON DELETE SET NULL,
  page int NOT NULL,
  seconds int NOT NULL,
  reaction text
);
CREATE INDEX IF NOT EXISTS detailing_views_product_idx ON detailing_views (product_id);
