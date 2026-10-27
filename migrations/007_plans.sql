CREATE TYPE plan_period AS ENUM ('weekly','monthly');
CREATE TYPE plan_status AS ENUM ('draft','pending','approved','rejected','needs_revision');

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period plan_period NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status plan_status NOT NULL DEFAULT 'draft',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id)
);
CREATE INDEX plans_user_period_idx ON plans(user_id, period_start);

CREATE TABLE plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  product_id uuid REFERENCES products(id),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_items_plan_idx ON plan_items(plan_id);

CREATE TABLE plan_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  note text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
