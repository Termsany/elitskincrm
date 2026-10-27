CREATE TABLE IF NOT EXISTS doctor_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
 sales_rep_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 visit_id uuid REFERENCES visits(id) ON DELETE SET NULL,
 product_id uuid REFERENCES products(id) ON DELETE SET NULL,
 title text NOT NULL,
 note text NOT NULL DEFAULT '',
 due_at date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS doctor_followups_scope_idx ON doctor_followups(doctor_id,sales_rep_id,status,due_at);
CREATE INDEX IF NOT EXISTS doctor_followups_due_idx ON doctor_followups(status,due_at);
