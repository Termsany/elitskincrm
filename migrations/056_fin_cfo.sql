-- CFO pack: correct P&L treatment, account audit reviews, annual goals, opening cash for the cash-flow forecast.
-- All CRM-side; nothing is written to Daftra.

-- Expense accounts (5xxx) must stay in the P&L. An earlier manual "exclude" on an expense account
-- (e.g. 5208 marketing) hid real operating cost and overstated profit.
DELETE FROM fin_account_overrides o USING daftra_accounts a
 WHERE a.id = o.account_id AND a.code LIKE '5%' AND o.treatment = 'exclude';

CREATE TABLE IF NOT EXISTS fin_audit_reviews (
  key         text PRIMARY KEY,
  status      text NOT NULL CHECK (status IN ('ok','fixed','ignored')),
  note        text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_goals (
  year       int PRIMARY KEY CHECK (year BETWEEN 2024 AND 2100),
  data       jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fin_settings ADD COLUMN IF NOT EXISTS cash_balance numeric(14,2);
ALTER TABLE fin_settings ADD COLUMN IF NOT EXISTS cash_as_of date;
