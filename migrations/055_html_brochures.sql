-- HTML files become regular brochures (shown to reps inside the presenter).
-- Move any file uploaded through the short-lived separate HTML tab into product_brochures.
DO $$
BEGIN
  IF to_regclass('public.product_html_files') IS NOT NULL THEN
    INSERT INTO product_brochures (product_id, title, file_name, mime, data, size_bytes, pages, sort_order, active, created_at, updated_at)
    SELECT h.product_id,
           COALESCE(NULLIF(h.title, ''), regexp_replace(h.file_name, '\.html?$', '', 'i')),
           h.file_name, 'text/html', h.data, h.size_bytes, 1,
           COALESCE((SELECT max(b.sort_order) + 1 FROM product_brochures b WHERE b.product_id = h.product_id), 0),
           true, h.created_at, h.updated_at
    FROM product_html_files h
    WHERE NOT EXISTS (SELECT 1 FROM product_brochures b WHERE b.product_id = h.product_id AND b.mime = 'text/html' AND b.file_name = h.file_name);
    DROP TABLE product_html_files;
  END IF;
END $$;
