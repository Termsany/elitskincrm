-- Multi-assignee + checklists + comments + attachments + rating + doctor link + repeat + progress + archived
-- Keep existing tasks.assigned_to for backward compat, add junction
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status task_status NOT NULL DEFAULT 'pending',
  failure_note text NOT NULL DEFAULT '',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
-- Migrate existing single-assignee rows
INSERT INTO task_assignees(task_id, user_id, status, failure_note, completed_at)
SELECT id, assigned_to, status, failure_note, completed_at FROM tasks
ON CONFLICT DO NOTHING;

-- Doctor link
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL;
-- Repeat
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_interval text NOT NULL DEFAULT 'none';
-- Archived
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
-- Rating (admin rates after completion)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rating int CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
-- Progress (computed but stored for quick filter)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS task_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_task_idx ON task_checklist(task_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_task_idx ON task_comments(task_id, created_at);

CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tattach_task_idx ON task_attachments(task_id);
