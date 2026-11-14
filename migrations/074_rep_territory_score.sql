-- Each rep's cities (set by the admin). Empty = the cities the rep actually worked in the last 90 days.
CREATE TABLE IF NOT EXISTS rep_cities (
  rep_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city text NOT NULL CHECK (btrim(city) <> ''),
  PRIMARY KEY (rep_id, city)
);
-- Weights of the monthly rep score (one row).
CREATE TABLE IF NOT EXISTS rep_score_weights (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plan int NOT NULL DEFAULT 30 CHECK (plan BETWEEN 0 AND 100),
  coverage int NOT NULL DEFAULT 25 CHECK (coverage BETWEEN 0 AND 100),
  sales int NOT NULL DEFAULT 25 CHECK (sales BETWEEN 0 AND 100),
  quality int NOT NULL DEFAULT 10 CHECK (quality BETWEEN 0 AND 100),
  discipline int NOT NULL DEFAULT 10 CHECK (discipline BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO rep_score_weights(id) VALUES (1) ON CONFLICT DO NOTHING;
