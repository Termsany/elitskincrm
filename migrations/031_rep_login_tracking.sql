ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE INDEX IF NOT EXISTS users_last_login_idx ON users(last_login_at);
