-- A rep can close a visit's follow-up without a new visit (done / not needed). Open = follow_up_at set and not done.
-- Fail fast (and retry on the next start) instead of waiting forever if another session holds a lock on visits.
SET LOCAL lock_timeout = '15s';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_done_at timestamptz;
