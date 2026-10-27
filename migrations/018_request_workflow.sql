ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users(id);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS last_action_at timestamptz;
CREATE INDEX IF NOT EXISTS service_requests_due_idx ON service_requests(status,due_at);