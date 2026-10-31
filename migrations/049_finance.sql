-- Finance hub: read-only mirror of Daftra purchases, products, customer payments, expenses/incomes and the
-- chart of accounts, plus CRM-only planning data (fixed expenses, targets, account overrides).
-- Nothing here is ever written back to Daftra.
CREATE TABLE IF NOT EXISTS daftra_purchases (
  id bigint PRIMARY KEY, no text NOT NULL DEFAULT '', invoice_date date NOT NULL, due_days integer NOT NULL DEFAULT 0,
  supplier_id bigint, supplier_name text NOT NULL DEFAULT '', payment_status smallint NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0, unpaid numeric(14,2) NOT NULL DEFAULT 0, refund numeric(14,2) NOT NULL DEFAULT 0,
  modified text NOT NULL DEFAULT '', synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daftra_purchases_date_idx ON daftra_purchases(invoice_date);
CREATE TABLE IF NOT EXISTS daftra_purchase_items (
  purchase_id bigint NOT NULL REFERENCES daftra_purchases(id) ON DELETE CASCADE, line integer NOT NULL,
  product_id bigint, item text NOT NULL DEFAULT '', quantity numeric(14,3) NOT NULL DEFAULT 0, unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0, net numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (purchase_id, line)
);
CREATE TABLE IF NOT EXISTS daftra_products (
  id bigint PRIMARY KEY, name text NOT NULL, code text NOT NULL DEFAULT '', list_price numeric(14,2) NOT NULL DEFAULT 0,
  buy_price numeric(14,2) NOT NULL DEFAULT 0, average_cost numeric(14,4) NOT NULL DEFAULT 0, min_price numeric(14,2),
  stock numeric(14,3) NOT NULL DEFAULT 0, track_stock boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daftra_client_payments (
  id bigint PRIMARY KEY, pay_date date NOT NULL, amount numeric(14,2) NOT NULL DEFAULT 0, client_id bigint,
  invoice_id bigint, method text NOT NULL DEFAULT '', status text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS daftra_client_payments_date_idx ON daftra_client_payments(pay_date);
CREATE TABLE IF NOT EXISTS daftra_accounts (
  id bigint PRIMARY KEY, code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', cat_id bigint
);
-- Expenses and other incomes recorded in Daftra (kind = 'expense' | 'income').
CREATE TABLE IF NOT EXISTS daftra_cash_entries (
  id bigint NOT NULL, kind text NOT NULL CHECK (kind IN ('expense','income')), entry_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0, tax numeric(14,2) NOT NULL DEFAULT 0, account_id bigint,
  vendor text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', modified text NOT NULL DEFAULT '',
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS daftra_cash_entries_date_idx ON daftra_cash_entries(entry_date);

-- CRM-only: how an account is treated in the P&L when the automatic rule (5xxx = expense) is not right.
CREATE TABLE IF NOT EXISTS fin_account_overrides (
  account_id bigint PRIMARY KEY, treatment text NOT NULL CHECK (treatment IN ('opex','cogs','exclude')),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- CRM-only: planned fixed monthly costs entered by the owner (rent, salaries, subscriptions…).
CREATE TABLE IF NOT EXISTS fin_fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text NOT NULL DEFAULT 'other',
  monthly_amount numeric(14,2) NOT NULL CHECK (monthly_amount >= 0), start_month date NOT NULL, end_month date,
  notes text NOT NULL DEFAULT '', created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_month IS NULL OR end_month >= start_month)
);
-- CRM-only: planning assumptions (single row).
CREATE TABLE IF NOT EXISTS fin_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  target_gross_margin numeric(5,2) NOT NULL DEFAULT 45,
  target_net_margin numeric(5,2) NOT NULL DEFAULT 15,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fin_settings(id) VALUES (1) ON CONFLICT DO NOTHING;
