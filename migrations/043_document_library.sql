-- Central document library: files uploaded directly + signed copies of any document in the app.
CREATE TABLE IF NOT EXISTS library_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  folder text NOT NULL DEFAULT 'عام',
  description text NOT NULL DEFAULT '',
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  data bytea NOT NULL,
  sha256 text NOT NULL,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private','team')),
  shared_with uuid REFERENCES users(id) ON DELETE SET NULL,
  signed boolean NOT NULL DEFAULT false,
  source_kind text,
  source_id text,
  sign_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS library_files_live_idx ON library_files(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_files_owner_idx ON library_files(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_files_source_idx ON library_files(source_kind, source_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS visit_attachments_created_idx ON visit_attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS task_attachments_created_idx ON task_attachments(created_at DESC);
