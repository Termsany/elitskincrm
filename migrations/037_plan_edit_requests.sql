-- A rep's proposed edit to an ALREADY-APPROVED plan.
-- The approved plan and its plan_items stay live and unchanged while the request
-- is pending. Approving applies the proposed items; rejecting keeps the original
-- approved plan exactly as it was (the original is also snapshotted for audit).
CREATE TABLE IF NOT EXISTS plan_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  note text NOT NULL DEFAULT '',
  proposed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_edit_requests_plan_idx ON plan_edit_requests(plan_id, created_at DESC);
-- At most one pending edit request per plan.
CREATE UNIQUE INDEX IF NOT EXISTS plan_edit_requests_one_pending ON plan_edit_requests(plan_id) WHERE status='pending';
