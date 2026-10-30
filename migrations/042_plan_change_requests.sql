-- Rep edits on approved plans become change requests; allow the rep to withdraw one.
ALTER TABLE plan_edit_requests DROP CONSTRAINT IF EXISTS plan_edit_requests_status_check;
ALTER TABLE plan_edit_requests ADD CONSTRAINT plan_edit_requests_status_check CHECK (status = ANY (ARRAY['pending','approved','rejected','cancelled']));
CREATE INDEX IF NOT EXISTS plan_edit_requests_pending_idx ON plan_edit_requests(status) WHERE status='pending';
