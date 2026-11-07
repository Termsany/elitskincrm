-- Sales actuals come from Daftra only. This view presents Daftra invoice lines in the same shape as an
-- approved forecast_sales row, so targets/attainment, rep pages, reports and rep P&L all read real invoices.
--   rep      = the rep linked to the Daftra customer (daftra_client_links)
--   clinic   = the linked clinic, else the clinic created for that Daftra customer
--   product  = the CRM product whose name appears as a word in the Daftra item name (NULL = other items)
--   value    = line net after the invoice's refunds; fully refunded / cancelled invoices count as 0
CREATE OR REPLACE VIEW daftra_sales_v AS
SELECT
  (i.id::text || '-' || it.line::text)                                   AS id,
  l.rep_id                                                                AS rep_id,
  COALESCE(l.clinic_id, c.id)                                             AS clinic_id,
  pm.product_id                                                           AS product_id,
  date_trunc('month', i.invoice_date)::date                               AS month,
  (it.quantity * k.f)::numeric                                             AS quantity,
  (it.net / it.quantity)::numeric                                          AS unit_price,
  (it.net * k.f)::numeric(14,2)                                           AS value,
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
LEFT JOIN LATERAL (SELECT p.id AS product_id FROM products p
                   WHERE it.item ~* ('(^|[^[:alnum:]])' || regexp_replace(p.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^[:alnum:]]|$)')
                   ORDER BY length(p.name) DESC LIMIT 1) pm ON true
WHERE it.quantity > 0 AND k.f > 0;
