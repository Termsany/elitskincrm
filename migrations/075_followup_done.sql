-- A rep can close a visit's follow-up without a new visit (done / not needed). Open = follow_up_at set and not done.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS follow_up_done_at timestamptz;
