-- GPS on visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS accuracy_m double precision;

-- Follow-up scheduling
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_at date;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_note text NOT NULL DEFAULT '';

-- Outbox for offline/notify reliability (optional)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
