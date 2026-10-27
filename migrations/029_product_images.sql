ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data bytea;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_mime text;
