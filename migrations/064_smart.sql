-- Structured insights extracted from visit notes (objections, positives, next step).
ALTER TABLE visits ADD COLUMN IF NOT EXISTS insights jsonb;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS insights_at timestamptz;
-- Discount guard: Daftra invoice lines above this discount % are flagged to the admin.
ALTER TABLE fin_settings ADD COLUMN IF NOT EXISTS max_discount_pct numeric(5,2) NOT NULL DEFAULT 15;
