CREATE TABLE IF NOT EXISTS document_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('signature','stamp')),
  name text NOT NULL,
  mime_type text NOT NULL,
  data bytea NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_assets_owner_idx ON document_assets(owner_id, kind, active, created_at DESC);
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS signed_sha256 text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS signed_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS document_sign_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES document_assets(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('signature','stamp')),
  page_number integer NOT NULL CHECK (page_number >= 1),
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL CHECK (width > 0),
  height numeric NOT NULL CHECK (height > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_sign_actions_request_idx ON document_sign_actions(request_id, created_at DESC);
