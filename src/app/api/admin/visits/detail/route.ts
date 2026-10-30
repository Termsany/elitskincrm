import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Full details of one visit for the admin "rep visits" popup.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const r = await query(`
    SELECT v.id, v.visited_at, v.created_at, v.status, v.notes, v.lat, v.lng, v.accuracy_m,
           v.follow_up_at::text AS follow_up_at, v.follow_up_note,
           u.id AS rep_id, u.name AS rep_name,
           d.id AS doctor_id, d.name AS doctor_name, d.clinic_name, d.city, d.specialty,
           d.classification, d.phone,
           COALESCE((SELECT json_agg(json_build_object('id',vi.id,'product_name',p.name,'kind',vi.kind,
                       'quantity',vi.quantity,'approval_status',vi.approval_status,'approval_note',vi.approval_note,
                       'sample_purpose',vi.sample_purpose) ORDER BY vi.kind, p.name)
                     FROM visit_items vi JOIN products p ON p.id=vi.product_id WHERE vi.visit_id=v.id),'[]'::json) AS items,
           COALESCE((SELECT json_agg(json_build_object('product_name',pr.name,'reaction',pp.reaction) ORDER BY pr.name)
                     FROM visit_presented_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.visit_id=v.id),'[]'::json) AS presented,
           COALESCE((SELECT json_agg(json_build_object('id',va.id,'file_name',va.file_name,'mime_type',va.mime_type,'size_bytes',va.size_bytes) ORDER BY va.created_at)
                     FROM visit_attachments va WHERE va.visit_id=v.id),'[]'::json) AS attachments
    FROM visits v
    JOIN users u ON u.id=v.sales_rep_id
    JOIN doctors d ON d.id=v.doctor_id
    WHERE v.id=$1`, [id]);
  if (!r.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ visit: r.rows[0] });
}
