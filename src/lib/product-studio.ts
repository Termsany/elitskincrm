import { query } from "@/lib/db";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BROCHURE_MAX = 19 * 1024 * 1024;
export const BROCHURE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const COLOR_RE = /^#[0-9a-f]{6}$/i;

export type BrochureMeta = { id: string; title: string; file_name: string; mime: string; size_bytes: number; pages: number; sort_order: number; active: boolean; updated_at: string };
export type CatalogProduct = {
  id: string; name: string; tagline: string; category: string; color: string; description: string;
  detailing_points: string; key_questions: string; detailing_version: string; content_updated_at: string;
  image_available: boolean; brochures: BrochureMeta[];
};

const BROCHURES_JSON = (where: string) => `COALESCE((SELECT json_agg(json_build_object('id',b.id,'title',b.title,'file_name',b.file_name,'mime',b.mime,'size_bytes',b.size_bytes,
  'pages',b.pages,'sort_order',b.sort_order,'active',b.active,'updated_at',b.updated_at) ORDER BY b.sort_order, b.created_at)
  FROM product_brochures b WHERE b.product_id=p.id ${where}),'[]'::json)`;

/** Products a rep can present (active products, active brochures). */
export async function repCatalog(): Promise<CatalogProduct[]> {
  const r = await query<CatalogProduct>(`SELECT p.id,p.name,p.tagline,p.category,p.color,COALESCE(p.description,'') description,
      COALESCE(p.detailing_points,'') detailing_points,COALESCE(p.key_questions,'') key_questions,COALESCE(p.detailing_version,'') detailing_version,
      p.content_updated_at,(p.image_data IS NOT NULL) image_available, ${BROCHURES_JSON("AND b.active")} brochures
    FROM products p WHERE p.active=true ORDER BY p.sort_order, p.name`);
  return r.rows;
}

/** Keep the legacy single-brochure columns pointing at the first active brochure (older screens + offline kit). */
export async function syncLegacyBrochure(productId: string) {
  await query(`UPDATE products p SET
      brochure_data = b.data, brochure_name = b.file_name, brochure_mime = b.mime, content_updated_at = now()
    FROM (SELECT NULL::int k) z
    LEFT JOIN LATERAL (SELECT data, file_name, mime FROM product_brochures WHERE product_id=$1 AND active ORDER BY sort_order, created_at LIMIT 1) b ON true
    WHERE p.id=$1`, [productId]);
}

/** Admin view: every product + brochures + 90-day activity. */
export async function studioProducts() {
  const r = await query(`SELECT p.id,p.name,p.active,p.tagline,p.category,p.color,p.sort_order,COALESCE(p.description,'') description,
      COALESCE(p.detailing_points,'') detailing_points,COALESCE(p.key_questions,'') key_questions,COALESCE(p.detailing_version,'') detailing_version,
      p.content_updated_at,p.created_at,(p.image_data IS NOT NULL) image_available, ${BROCHURES_JSON("")} brochures,
      (SELECT count(*)::int FROM users u WHERE u.assigned_product_id=p.id AND u.role='sales_rep' AND u.active) reps_count,
      (SELECT json_build_object(
          'presented', count(*), 'interested', count(*) FILTER (WHERE pp.reaction='interested'),
          'neutral', count(*) FILTER (WHERE pp.reaction='neutral'), 'not_interested', count(*) FILTER (WHERE pp.reaction='not_interested'),
          'doctors', count(DISTINCT v.doctor_id), 'reps', count(DISTINCT v.sales_rep_id), 'last', max(v.visited_at))
        FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id WHERE pp.product_id=p.id AND v.visited_at > now() - interval '90 days') presentations,
      (SELECT json_build_object('samples', COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='sample'),0), 'orders', COALESCE(sum(vi.quantity) FILTER (WHERE vi.kind='order'),0))
        FROM visit_items vi JOIN visits v ON v.id=vi.visit_id WHERE vi.product_id=p.id AND v.visited_at > now() - interval '90 days') items,
      (SELECT json_build_object('sessions', count(DISTINCT dv.session_id), 'seconds', COALESCE(sum(dv.seconds),0))
        FROM detailing_views dv JOIN detailing_sessions s ON s.id=dv.session_id WHERE dv.product_id=p.id AND s.started_at > now() - interval '90 days') detailing,
      COALESCE((SELECT json_agg(x ORDER BY x.seconds DESC) FROM (SELECT dv.brochure_id, dv.page, sum(dv.seconds)::int seconds
          FROM detailing_views dv JOIN detailing_sessions s ON s.id=dv.session_id
          WHERE dv.product_id=p.id AND s.started_at > now() - interval '90 days' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5) x),'[]'::json) top_pages,
      (EXISTS(SELECT 1 FROM visit_items WHERE product_id=p.id) OR EXISTS(SELECT 1 FROM visit_presented_products WHERE product_id=p.id)
        OR EXISTS(SELECT 1 FROM users WHERE assigned_product_id=p.id)) in_use
    FROM products p ORDER BY p.sort_order, p.name`);
  return r.rows;
}

/** Page count read on the server (pdf-lib); falls back to the client's value. */
export async function countPdfPages(buf: Buffer, fallback: number): Promise<number> {
  try { const { PDFDocument } = await import("pdf-lib"); const d = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }); return d.getPageCount(); }
  catch { return Math.max(1, Math.min(999, fallback || 1)); }
}
