ALTER TABLE doctors ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS doctors_email_search_idx ON doctors (lower(email));
