ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_recurrence_parent_unique
  ON tasks(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
