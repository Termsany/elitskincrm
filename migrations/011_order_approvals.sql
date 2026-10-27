ALTER TABLE visit_items ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE visit_items ADD COLUMN IF NOT EXISTS approval_note text NOT NULL DEFAULT '';
ALTER TABLE visit_items ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE visit_items ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE visit_items ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE visit_items ADD CONSTRAINT visit_items_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS visit_items_pending_orders_idx
  ON visit_items(approval_status, created_at)
  WHERE kind='order' AND approval_status='pending';

ALTER TABLE task_notifications ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES visit_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS task_notifications_order_idx ON task_notifications(order_item_id);
