-- A rep hides a smart suggestion (e.g. a clinic due to reorder) until a date: "visited", "remind me later", "not mine".
CREATE TABLE IF NOT EXISTS smart_dismissals (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text NOT NULL,
  until date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);
