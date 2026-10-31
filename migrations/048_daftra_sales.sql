-- Read-only mirror of Daftra (accounting) sales invoices, refreshed by the sync job.
CREATE TABLE IF NOT EXISTS daftra_invoices (
  id bigint PRIMARY KEY,
  no text NOT NULL DEFAULT '',
  invoice_date date NOT NULL,
  due_days integer NOT NULL DEFAULT 0,
  client_id bigint,
  client_name text NOT NULL DEFAULT '',
  client_city text NOT NULL DEFAULT '',
  branch text NOT NULL DEFAULT '',
  payment_status smallint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  net numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  unpaid numeric(14,2) NOT NULL DEFAULT 0,
  refund numeric(14,2) NOT NULL DEFAULT 0,
  modified text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daftra_invoices_date_idx ON daftra_invoices(invoice_date);
CREATE TABLE IF NOT EXISTS daftra_invoice_items (
  invoice_id bigint NOT NULL REFERENCES daftra_invoices(id) ON DELETE CASCADE,
  line integer NOT NULL,
  product_id bigint,
  item text NOT NULL DEFAULT '',
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (invoice_id, line)
);
CREATE TABLE IF NOT EXISTS daftra_sync (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  started_at timestamptz,
  finished_at timestamptz,
  ok boolean,
  message text NOT NULL DEFAULT '',
  invoices integer NOT NULL DEFAULT 0
);
INSERT INTO daftra_sync(id) VALUES (1) ON CONFLICT DO NOTHING;
