ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS service_request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendar_events_service_request_idx ON calendar_events(service_request_id);
