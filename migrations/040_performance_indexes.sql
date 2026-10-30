-- Indexes for growing visit/plan volume (doctor history, admin date ranges, plan lookups).
CREATE INDEX IF NOT EXISTS visits_doctor_date_idx ON visits (doctor_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS visits_date_idx ON visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS plan_items_doctor_idx ON plan_items (doctor_id);
CREATE INDEX IF NOT EXISTS plan_items_date_idx ON plan_items (planned_date);
