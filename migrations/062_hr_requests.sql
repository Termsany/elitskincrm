-- Employee requests: leave (annual / sick / unpaid), exit & re-entry visa, salary advance, salary letter.
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_kind_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_kind_check
  CHECK (kind IN ('document_signature','manual_request','leave','exit_reentry','advance','salary_letter'));
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS hr_type text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS days int;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS installments int;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS hr_details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS service_requests_hr_idx ON service_requests(requester_id, kind, start_date)
  WHERE kind IN ('leave','exit_reentry','advance','salary_letter');

-- Annual leave: NULL = by law (21 days, 30 after five years); carry-over adds to this year's balance.
ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_leave_days int;
ALTER TABLE users ADD COLUMN IF NOT EXISTS leave_carryover int NOT NULL DEFAULT 0;
