-- Admin review of flagged visits, a visit's edit history, collection follow-ups, and the review rules.
CREATE TABLE IF NOT EXISTS visit_checks (
  visit_id uuid PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('approved','correction')),
  reason text NOT NULL DEFAULT '',
  fields text[] NOT NULL DEFAULT '{}',
  checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS visit_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_edits_visit ON visit_edits(visit_id, at);
CREATE TABLE IF NOT EXISTS admin_collection_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party text NOT NULL,
  result text NOT NULL CHECK (result IN ('promise','extension','no_answer','collected')),
  promised_date date,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_collection_notes_party ON admin_collection_notes(party, created_at DESC);
CREATE TABLE IF NOT EXISTS review_rules (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_notes int NOT NULL DEFAULT 15,
  far_m int NOT NULL DEFAULT 300,
  days int NOT NULL DEFAULT 14
);
INSERT INTO review_rules(id) VALUES (1) ON CONFLICT DO NOTHING;
