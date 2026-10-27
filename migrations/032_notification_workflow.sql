ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS task_notifications_workflow_idx ON task_notifications(user_id,status,snoozed_until,created_at DESC);
