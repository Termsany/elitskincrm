CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('document_signature','manual_request')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','rejected')),
  file_data bytea,
  file_name text,
  file_mime text,
  response text NOT NULL DEFAULT '',
  signed_file_data bytea,
  signed_file_name text,
  signed_file_mime text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS service_requests_requester_idx ON service_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON service_requests(status, created_at DESC);
