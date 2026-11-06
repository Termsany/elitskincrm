-- P&L, advisor, goals and audit count from this date; receivables/payables keep every open document.
ALTER TABLE fin_settings ADD COLUMN IF NOT EXISTS books_start date;
UPDATE fin_settings SET books_start = '2026-11-01' WHERE id = 1 AND books_start IS NULL;
