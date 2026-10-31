-- A rep can mark a doctor "inactive" for one calendar month (e.g. on leave, won't be visited).
-- Paused doctors are excluded from that rep's coverage targets for that month only.
CREATE TABLE IF NOT EXISTS doctor_month_pauses (
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, doctor_id, month)
);
CREATE INDEX IF NOT EXISTS doctor_month_pauses_month_idx ON doctor_month_pauses(month, doctor_id);
