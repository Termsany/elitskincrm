-- Recycle bin for anything deleted from the document library (restorable for 30 days).
CREATE TABLE IF NOT EXISTS library_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src text NOT NULL,
  item_id text NOT NULL,
  name text NOT NULL,
  mime text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  data bytea,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ctx text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_trash_deleted_idx ON library_trash(deleted_at DESC);
CREATE INDEX IF NOT EXISTS library_trash_by_idx ON library_trash(deleted_by);
