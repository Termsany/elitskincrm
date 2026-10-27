CREATE TABLE IF NOT EXISTS plan_frequencies (
  classification text PRIMARY KEY,
  visits_per_month int NOT NULL DEFAULT 1
);
INSERT INTO plan_frequencies(classification, visits_per_month) VALUES('A',4),('B',2),('C',1) ON CONFLICT DO NOTHING;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS cycle int;
ALTER TABLE plan_items ADD COLUMN IF NOT EXISTS cycle int;
