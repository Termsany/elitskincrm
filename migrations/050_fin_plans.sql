-- Monthly sales plan per product (CRM only — never written to Daftra).
CREATE TABLE IF NOT EXISTS fin_plans (
  month text PRIMARY KEY CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  data jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
