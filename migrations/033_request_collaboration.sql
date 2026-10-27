ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS urgent_reason text NOT NULL DEFAULT '';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS resolution_summary text NOT NULL DEFAULT '';

ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending','in_progress','needs_info','approved','deferred',
    'completed','rejected','cancelled','reopened','closed'
  ));

CREATE TABLE IF NOT EXISTS service_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','admin')),
  message text NOT NULL DEFAULT '',
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_request_events_request_idx
  ON service_request_events(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_assigned_idx
  ON service_requests(assigned_to, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_requester_status_idx
  ON service_requests(requester_id, status, updated_at DESC);

INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,to_status,created_at)
SELECT r.id,r.requester_id,'created','shared','تم إنشاء الطلب',r.status,r.created_at
FROM service_requests r
WHERE NOT EXISTS (SELECT 1 FROM service_request_events e WHERE e.request_id=r.id);
