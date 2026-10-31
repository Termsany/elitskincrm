-- Sales clinics come from Daftra customers; one list price per product; admin targets per product (amount ⇄ units).
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS daftra_client_id bigint UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) CHECK (unit_price IS NULL OR unit_price > 0);

-- seed: Daftra customers (from synced invoices) become sales clinics
INSERT INTO clinics(name, city, daftra_client_id, source_key)
SELECT DISTINCT ON (client_id) btrim(client_name), COALESCE(client_city, ''), client_id, 'daftra:' || client_id
FROM daftra_invoices WHERE client_id IS NOT NULL AND length(btrim(client_name)) > 0
ORDER BY client_id, invoice_date DESC
ON CONFLICT (source_key) DO UPDATE SET name = EXCLUDED.name, daftra_client_id = EXCLUDED.daftra_client_id, active = true;

-- seed: product list price = latest clinic price ever set for it
UPDATE products p SET unit_price = x.price FROM (
  SELECT DISTINCT ON (product_id) product_id, price FROM forecast_prices ORDER BY product_id, month DESC, created_at DESC
) x WHERE x.product_id = p.id AND p.unit_price IS NULL;

CREATE TABLE IF NOT EXISTS rep_target_products (
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^20[0-9]{2}(-(0[1-9]|1[0-2]))?$'),
  product_id uuid NOT NULL REFERENCES products(id),
  mode text NOT NULL CHECK (mode IN ('amount', 'units')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price > 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  set_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, period, product_id)
);
