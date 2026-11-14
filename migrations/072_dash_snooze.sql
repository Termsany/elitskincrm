-- "بعدين" on the admin home "ابدأ من هنا" cards, kept per user on the server (same on every device) for one day.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dash_snooze jsonb NOT NULL DEFAULT '{}'::jsonb;
