-- Manager coaching on visits + verified clinic locations (learned from visits or pinned by the manager).
CREATE TABLE IF NOT EXISTS visit_reviews (
  visit_id uuid PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clinic_locations (
  clinic_key text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  set_by uuid REFERENCES users(id) ON DELETE SET NULL,
  from_visit uuid REFERENCES visits(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_rep_time_idx ON visits(sales_rep_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS detailing_sessions_rep_doc_idx ON detailing_sessions(rep_id, doctor_id, started_at);
CREATE INDEX IF NOT EXISTS visit_presented_visit_idx ON visit_presented_products(visit_id);
CREATE INDEX IF NOT EXISTS visit_items_visit_idx ON visit_items(visit_id);
