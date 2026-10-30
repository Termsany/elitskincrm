-- Reps ask the manager to sign/stamp a document; signed copies are publicly verifiable by reference or fingerprint.
CREATE TABLE IF NOT EXISTS sign_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src text NOT NULL,
  item_id text NOT NULL,
  file_name text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  want text NOT NULL DEFAULT 'signature' CHECK (want IN ('signature','stamp','both')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','rejected','cancelled')),
  signed_file_id uuid REFERENCES library_files(id) ON DELETE SET NULL,
  admin_note text NOT NULL DEFAULT '',
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sign_requests_status_idx ON sign_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS sign_requests_by_idx ON sign_requests(requested_by, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sign_requests_one_pending ON sign_requests(src, item_id, requested_by) WHERE status='pending';
CREATE INDEX IF NOT EXISTS library_files_ref_idx ON library_files((sign_meta->>'ref')) WHERE signed;
CREATE INDEX IF NOT EXISTS library_files_sha_idx ON library_files(sha256) WHERE signed;
CREATE INDEX IF NOT EXISTS service_requests_signed_sha_idx ON service_requests(signed_sha256) WHERE signed_sha256 IS NOT NULL;
