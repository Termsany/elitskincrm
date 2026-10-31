-- Daftra customer → CRM rep/clinic link (CRM only, never written to Daftra) and collection follow-ups.
CREATE TABLE IF NOT EXISTS daftra_client_links (
  client_id bigint PRIMARY KEY,
  rep_id uuid REFERENCES users(id) ON DELETE SET NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daftra_client_links_rep_idx ON daftra_client_links(rep_id);
CREATE TABLE IF NOT EXISTS collection_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id bigint NOT NULL,
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('contacted','promised','partial','paid','disputed','no_answer')),
  promise_date date,
  amount numeric(14,2) CHECK (amount IS NULL OR amount >= 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collection_followups_client_idx ON collection_followups(client_id, created_at DESC);
