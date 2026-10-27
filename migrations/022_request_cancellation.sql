ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('pending','in_progress','completed','rejected','cancelled'));
