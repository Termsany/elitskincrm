-- Sales manager: sees and manages all sales work (reps, visits, doctors, plans, forecast, reports)
-- but not company accounts (Daftra finance, expenses, audit, users, products master data).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TABLE users DROP CONSTRAINT IF EXISTS rep_requires_product;
ALTER TABLE users ADD CONSTRAINT rep_requires_product CHECK (role::text <> 'sales_rep' OR assigned_product_id IS NOT NULL);
