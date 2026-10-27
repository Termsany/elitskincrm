ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS entity_id text;
CREATE INDEX IF NOT EXISTS task_notifications_entity_idx
  ON task_notifications(user_id, entity_type, entity_id, created_at DESC);
