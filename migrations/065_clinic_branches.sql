-- One Daftra customer → several CRM clinics (branches with their own doctors and places). A branch belongs to one customer.
CREATE TABLE IF NOT EXISTS daftra_client_branches (
  client_id bigint NOT NULL,
  clinic_id uuid NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, clinic_id)
);
