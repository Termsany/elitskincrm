-- When the user last opened the bell, and the live "needs you now" counts at that moment:
-- the badge shows only what is new since then.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_seen_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bell_seen_live jsonb NOT NULL DEFAULT '{}'::jsonb;
