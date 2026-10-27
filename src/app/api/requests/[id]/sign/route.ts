import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { PDFDocument, type PDFImage } from "pdf-lib";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type SignBody = { asset_id?: unknown; kind?: unknown; page_number?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown };
type RequestRow = { requester_id: string; title: string; file_data: Buffer | null; file_name: string | null; file_mime: string | null; signed_file_data: Buffer | null; signed_file_mime: string | null; status: string };
type AssetRow = { id: string; kind: string; mime_type: string; data: Buffer };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as SignBody | null;
  const pageNumber = Number(body?.page_number ?? 1);
  const x = Number(body?.x), y = Number(body?.y), width = Number(body?.width ?? 140), height = Number(body?.height ?? 60);
  if (!Number.isFinite(pageNumber) || !Number.isInteger(pageNumber) || pageNumber < 1 || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 20 || height < 10) return NextResponse.json({ error: "إحداثيات التوقيع غير صحيحة" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query<RequestRow>(`SELECT requester_id,title,file_data,file_name,file_mime,signed_file_data,signed_file_mime,status FROM service_requests WHERE id=$1 FOR UPDATE`, [id]);
    const request = requestResult.rows[0];
    if (!request) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Not found" }, { status: 404 }); }
    if (!["pending", "in_progress", "approved", "reopened"].includes(request.status)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "حالة الطلب لا تسمح بتوقيع المستند" }, { status: 409 }); }
    if (request.file_mime !== "application/pdf" && request.signed_file_mime !== "application/pdf") { await client.query("ROLLBACK"); return NextResponse.json({ error: "التوقيع المرئي متاح حاليًا لملفات PDF فقط" }, { status: 415 }); }

    const assetResult = await client.query<AssetRow>("SELECT id,kind,mime_type,data FROM document_assets WHERE id=$1 AND owner_id=$2 AND active=true", [String(body?.asset_id || ""), user.id]);
    const asset = assetResult.rows[0];
    if (!asset) { await client.query("ROLLBACK"); return NextResponse.json({ error: "الأصل غير موجود" }, { status: 404 }); }
    const kind = String(body?.kind || asset.kind);
    if (kind !== asset.kind) { await client.query("ROLLBACK"); return NextResponse.json({ error: "نوع الأصل غير متطابق" }, { status: 400 }); }
    if (!["image/png", "image/jpeg"].includes(asset.mime_type)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "صيغة أصل التوقيع غير مدعومة" }, { status: 415 }); }

    const input = request.signed_file_data && request.signed_file_mime === "application/pdf" ? request.signed_file_data : request.file_data;
    if (!input) { await client.query("ROLLBACK"); return NextResponse.json({ error: "المستند الأصلي غير موجود" }, { status: 404 }); }
    let pdf: PDFDocument;
    try { pdf = await PDFDocument.load(input); }
    catch { await client.query("ROLLBACK"); return NextResponse.json({ error: "ملف PDF غير صالح أو تالف" }, { status: 400 }); }
    if (pageNumber > pdf.getPageCount()) { await client.query("ROLLBACK"); return NextResponse.json({ error: "رقم الصفحة غير موجود" }, { status: 400 }); }
    const page = pdf.getPage(pageNumber - 1);
    if (x + width > page.getWidth() || y + height > page.getHeight()) { await client.query("ROLLBACK"); return NextResponse.json({ error: "يجب أن يكون التوقيع داخل حدود الصفحة" }, { status: 400 }); }
    let image: PDFImage;
    try { image = asset.mime_type === "image/png" ? await pdf.embedPng(asset.data) : await pdf.embedJpg(asset.data); }
    catch { await client.query("ROLLBACK"); return NextResponse.json({ error: "صورة التوقيع أو الختم غير صالحة" }, { status: 400 }); }
    page.drawImage(image, { x, y, width, height, opacity: 1 });
    const output = Buffer.from(await pdf.save());
    const hash = createHash("sha256").update(output).digest("hex");
    const responseMessage = `${kind === "stamp" ? "تم ختم" : "تم توقيع"} المستند واعتماده`;

    const action = await client.query(`INSERT INTO document_sign_actions(request_id,actor_id,asset_id,kind,page_number,x,y,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [id, user.id, asset.id, kind, pageNumber, x, y, width, height]);
    await client.query(`UPDATE service_requests SET status='completed',signed_file_data=$1,signed_file_name=$2,signed_file_mime='application/pdf',signed_sha256=$3,signed_at=now(),signed_by=$4,responded_at=now(),responded_by=$4,updated_at=now(),last_action_at=now(),claimed_at=COALESCE(claimed_at,now()),closed_at=NULL,resolution_summary=$5,response=$5 WHERE id=$6`, [output, `signed-${request.file_name || "document.pdf"}`, hash, user.id, responseMessage, id]);
    await client.query(`INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,from_status,to_status) VALUES($1,$2,'document_signed','shared',$3,$4,'completed')`, [id, user.id, responseMessage, request.status]);
    await client.query(`INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'document_signed',$2,$3,'service_request',$4)`, [request.requester_id, `تم توقيع/ختم مستندك: ${request.title}`, `/requests?request=${id}`, id]);
    await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'sign','service_request',$2,$3)`, [user.id, id, JSON.stringify({ kind, page_number: pageNumber, asset_id: asset.id, sha256: hash, action_id: action.rows[0].id })]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, sha256: hash, action_id: action.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
