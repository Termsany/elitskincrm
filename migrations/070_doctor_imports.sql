-- One row per applied Excel doctor-list upload: what it changed (for the report) and a snapshot to undo it.
CREATE TABLE IF NOT EXISTS doctor_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL DEFAULT '',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS doctor_imports_created_idx ON doctor_imports(created_at DESC);
