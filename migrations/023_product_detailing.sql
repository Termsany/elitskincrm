ALTER TABLE products ADD COLUMN IF NOT EXISTS detailing_points text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_questions text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS detailing_version text NOT NULL DEFAULT '1.0';
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT now();
