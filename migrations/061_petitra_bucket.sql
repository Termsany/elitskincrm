-- Every Daftra item that isn't one of the CRM products falls under a single product line: PETITRA.
-- (An admin can still map any item to a specific product in المبيعات والأهداف ← الأصناف والمناديب.)
INSERT INTO products(name, active, sort_order) VALUES ('PETITRA', true, 90) ON CONFLICT (name) DO UPDATE SET active = true;

CREATE OR REPLACE VIEW daftra_sales_v AS
SELECT
  (i.id::text || '-' || it.line::text || '-' || COALESCE(r.rep_id::text, 'x'))  AS id,
  r.rep_id                                                                 AS rep_id,
  COALESCE(l.clinic_id, c.id)                                              AS clinic_id,
  pr.product_id                                                            AS product_id,
  date_trunc('month', i.invoice_date)::date                                AS month,
  (it.quantity * k.f / COALESCE(r.n, 1))::numeric                          AS quantity,
  (it.net / it.quantity)::numeric                                          AS unit_price,
  (it.net * k.f / COALESCE(r.n, 1))::numeric(14,2)                         AS value,
  'approved'::text AS status, 'sale'::text AS kind, 1::smallint AS direction,
  NULL::text AS source_sale_id, NULL::text AS reason, NULL::text AS review_note,
  i.invoice_date::timestamptz AS submitted_at, i.invoice_date::timestamptz AS reviewed_at, NULL::uuid AS reviewer_id,
  i.id AS invoice_id, i.no AS invoice_no, i.invoice_date AS invoice_date, i.client_id AS client_id, i.client_name AS client_name, it.item AS item
FROM daftra_invoices i
JOIN daftra_invoice_items it ON it.invoice_id = i.id
CROSS JOIN LATERAL (SELECT CASE WHEN i.payment_status = 3 OR (i.total > 0 AND i.refund >= i.total) THEN 0
                                WHEN i.total > 0 THEN GREATEST(0, 1 - i.refund / i.total) ELSE 1 END::numeric AS f) k
LEFT JOIN daftra_client_links l ON l.client_id = i.client_id
LEFT JOIN clinics c ON c.daftra_client_id = i.client_id
LEFT JOIN daftra_item_products m ON m.item_key = lower(btrim(it.item))
LEFT JOIN LATERAL (SELECT p.id AS product_id FROM products p
                   WHERE it.item ~* ('(^|[^[:alnum:]])' || regexp_replace(p.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^[:alnum:]]|$)')
                   ORDER BY length(p.name) DESC LIMIT 1) pm ON true
CROSS JOIN LATERAL (SELECT COALESCE(m.product_id, pm.product_id, (SELECT p.id FROM products p WHERE upper(p.name) = 'PETITRA' LIMIT 1)) AS product_id) pr
LEFT JOIN LATERAL (SELECT u.id AS rep_id, count(*) OVER () AS n FROM users u
                   WHERE pr.product_id IS NOT NULL AND u.role = 'sales_rep' AND u.active
                     AND (u.assigned_product_id = pr.product_id OR EXISTS (SELECT 1 FROM rep_products rp WHERE rp.rep_id = u.id AND rp.product_id = pr.product_id))) r ON true
WHERE it.quantity > 0 AND k.f > 0;
