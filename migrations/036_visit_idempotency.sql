ALTER TABLE visits ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS visits_rep_idempotency_idx
  ON visits(sales_rep_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
