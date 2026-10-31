-- Rep expenses: submit (with receipts) → admin approve/reject → reimbursed. Feeds rep profitability (P&L).
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'wallet',
  monthly_cap numeric(12,2) CHECK (monthly_cap IS NULL OR monthly_cap >= 0),
  receipt_required_above numeric(12,2) NOT NULL DEFAULT 100 CHECK (receipt_required_above >= 0),
  allows_doctor boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO expense_categories(code, name, icon, monthly_cap, receipt_required_above, allows_doctor, sort) VALUES
  ('fuel', 'وقود ومواصلات', 'fuel', 1500, 100, false, 1),
  ('parking', 'مواقف ورسوم طرق', 'parking', 300, 50, false, 2),
  ('hospitality', 'ضيافة ووجبات مع أطباء', 'hospitality', 2000, 0, true, 3),
  ('promo', 'هدايا ومواد ترويجية', 'gift', 1500, 0, true, 4),
  ('events', 'مؤتمرات وفعاليات', 'events', NULL, 0, true, 5),
  ('travel', 'سفر وإقامة', 'travel', NULL, 0, false, 6),
  ('phone', 'اتصالات وإنترنت', 'phone', 300, 100, false, 7),
  ('print', 'مطبوعات وتصوير', 'file', 500, 100, false, 8),
  ('other', 'أخرى', 'wallet', 500, 0, false, 9)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES expense_categories(id),
  expense_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  vat_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  merchant text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reimbursed')),
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '',
  reimbursed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reimbursed_at timestamptz,
  payment_ref text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vat_amount <= amount)
);
CREATE INDEX IF NOT EXISTS expenses_rep_date_idx ON expenses(rep_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_status_idx ON expenses(status, created_at);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS expense_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_receipts_expense_idx ON expense_receipts(expense_id);
