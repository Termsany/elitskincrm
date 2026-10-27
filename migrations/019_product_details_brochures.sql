ALTER TABLE products ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brochure_data bytea;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brochure_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brochure_mime text;
