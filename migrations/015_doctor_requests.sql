CREATE TABLE IF NOT EXISTS doctor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('create','update')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doctor_requests_status_idx ON doctor_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS doctor_requests_requester_idx ON doctor_requests(requester_id, created_at DESC);