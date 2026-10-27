ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES visits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendar_events_visit_idx ON calendar_events(visit_id);
