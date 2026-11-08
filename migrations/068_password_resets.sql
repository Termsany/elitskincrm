-- "Forgot password": a user asks, the admin sets a new password from the reps page.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  outcome text
);
CREATE INDEX IF NOT EXISTS password_reset_requests_open ON password_reset_requests(requested_at) WHERE handled_at IS NULL;
