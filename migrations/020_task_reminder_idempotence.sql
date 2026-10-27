CREATE UNIQUE INDEX IF NOT EXISTS task_notifications_daily_task_unique
  ON task_notifications(user_id, task_id, notification_date, kind)
  WHERE task_id IS NOT NULL AND notification_date IS NOT NULL;
