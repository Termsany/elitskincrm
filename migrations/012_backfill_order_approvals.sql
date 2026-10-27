UPDATE visit_items
SET approval_status='pending', approved_by=NULL, approved_at=NULL
WHERE kind='order' AND approved_by IS NULL;
