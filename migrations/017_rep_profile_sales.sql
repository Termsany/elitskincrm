ALTER TABLE users ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS iqama_expiry date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_sales_target numeric(14,2) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS rep_products (rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, PRIMARY KEY(rep_id,product_id));
CREATE TABLE IF NOT EXISTS rep_monthly_sales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, sale_month date NOT NULL, amount numeric(14,2) NOT NULL CHECK(amount>=0), created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(rep_id,sale_month));
CREATE INDEX IF NOT EXISTS rep_monthly_sales_rep_month_idx ON rep_monthly_sales(rep_id,sale_month);