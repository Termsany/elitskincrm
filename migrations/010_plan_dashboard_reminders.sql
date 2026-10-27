ALTER TABLE task_notifications ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS notification_date date;
CREATE UNIQUE INDEX IF NOT EXISTS task_notifications_daily_plan_unique
  ON task_notifications(user_id, plan_id, notification_date, kind)
  WHERE plan_id IS NOT NULL AND notification_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS task_notifications_plan_idx ON task_notifications(plan_id);
ALTER TABLE task_comments ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_plan_idx ON task_comments(plan_id, created_at);
