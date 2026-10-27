-- Products the rep presented (detailed) to the doctor during a visit, with the doctor's reaction.
-- Sample rows stay in visit_items(kind='sample'); this table is additive and does not alter them.
CREATE TABLE IF NOT EXISTS visit_presented_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  reaction text NOT NULL DEFAULT 'neutral' CHECK (reaction IN ('interested','neutral','not_interested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, product_id)
);
CREATE INDEX IF NOT EXISTS visit_presented_products_product_idx ON visit_presented_products(product_id);
