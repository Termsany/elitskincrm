import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { listLibrary, detectType, cleanName, cleanFolder, sha256, MAX_UPLOAD } from "@/lib/library";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const out = await listLibrary(u, { q: sp.get("q") || "", src: sp.get("src") || "", type: sp.get("type") || "", folder: sp.get("folder") || "", scope: sp.get("scope") || "", sort: sp.get("sort") || "" });
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "اختار ملف واحد على الأقل" }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "الحد 10 ملفات في المرة" }, { status: 400 });
  const folder = cleanFolder(form.get("folder"));
  const description = String(form.get("description") || "").trim().slice(0, 300);
  const visibility = form.get("visibility") === "private" ? "private" : "team";
  const created: Array<{ id: string; name: string }> = []; const rejected: Array<{ name: string; error: string }> = [];
  for (const f of files) {
    const name = cleanName(f.name);
    if (f.size > MAX_UPLOAD) { rejected.push({ name, error: "أكبر من 15MB" }); continue; }
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = detectType(buf, name);
    if (!mime) { rejected.push({ name, error: "نوع غير مدعوم" }); continue; }
    const r = await query(`INSERT INTO library_files(owner_id,name,folder,description,mime,size_bytes,data,sha256,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [u.id, name, folder, description, mime, buf.length, buf, sha256(buf), visibility]);
    created.push({ id: r.rows[0].id, name });
  }
  if (created.length) await query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'upload','library_file',$2,$3)`, [u.id, created[0].id, JSON.stringify({ count: created.length, folder })]);
  return NextResponse.json({ created, rejected }, { status: created.length ? 201 : 400 });
}
