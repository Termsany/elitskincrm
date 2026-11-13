import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool, query } from "@/lib/db";
import { planSync, readDoctorSheet, SheetError, type Existing, type Plan } from "@/lib/doctor-sync";

export const runtime = "nodejs";
const MAX = 10 * 1024 * 1024;
const BIG = 0.3; // removing more than this share of active doctors needs an explicit confirmation
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; }

// A doctor with any of these is archived (status 'inactive') instead of deleted, so history stays intact.
const HISTORY = ["visits", "plan_items", "doctor_followups", "doctor_month_pauses", "tasks", "doctor_requests", "calendar_events", "detailing_sessions", "expenses"];

/** Template to fill in (GET). */
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM";
  const ws = wb.addWorksheet("الأطباء", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const head = ["اسم الطبيب", "العيادة", "المدينة", "التخصص", "التصنيف", "الجوال", "البريد", "المعرف"];
  const h = ws.addRow(head); h.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10484F" } }; });
  const rows = await query<{ id: string; name: string; clinic_name: string; city: string; specialty: string; classification: string; phone: string; email: string }>(
    "SELECT id,name,clinic_name,city,specialty,classification,phone,email FROM doctors WHERE COALESCE(status,'active')='active' AND merged_into IS NULL ORDER BY clinic_name,name");
  for (const d of rows.rows) ws.addRow([d.name, d.clinic_name, d.city, d.specialty, d.classification, d.phone, d.email, d.id]);
  [26, 26, 14, 16, 9, 15, 24, 38].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as unknown as BodyInit, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="doctors-list-${new Date().toISOString().slice(0, 10)}.xlsx"`, "cache-control": "no-store" } });
}

/** Upload: ?apply=1 writes the changes, otherwise only returns what would change. */
export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const apply = sp.get("apply") === "1";
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "اختار ملف إكسيل" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "الملف أكبر من 10MB" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "الملف لازم يكون .xlsx (احفظه من إكسيل كـ Excel Workbook)" }, { status: 400 });

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  let sheet: ReturnType<typeof readDoctorSheet>;
  try { await wb.xlsx.load(await file.arrayBuffer()); sheet = readDoctorSheet(wb); }
  catch (e) { return NextResponse.json({ error: e instanceof SheetError ? e.message : "مش قادر أقرا الملف — اتأكد إنه ملف إكسيل سليم" }, { status: 400 }); }
  if (!sheet.rows.length) return NextResponse.json({ error: "الملف مفيهوش أطباء" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (apply) await client.query("LOCK TABLE doctors IN SHARE ROW EXCLUSIVE MODE");
    const ex = await client.query<Existing>("SELECT id,name,clinic_name,city,specialty,classification,phone,email,COALESCE(status,'active') status FROM doctors WHERE merged_into IS NULL");
    const plan = planSync(sheet.rows, ex.rows);
    const removeIds = plan.remove.map(d => d.id);
    const hist = removeIds.length ? await client.query<{ id: string }>(
      `SELECT d.id FROM unnest($1::uuid[]) d(id) WHERE ${HISTORY.map(t => `EXISTS (SELECT 1 FROM ${t} x WHERE x.doctor_id=d.id)`).join(" OR ")}`, [removeIds]) : { rows: [] };
    const keepHistory = new Set(hist.rows.map(r => r.id));
    const activeNow = ex.rows.filter(d => d.status === "active").length;
    const summary = {
      sheet: sheet.sheet, rows: sheet.rows.length, skipped: sheet.skipped, duplicates: plan.duplicates,
      add: plan.add.length, update: plan.update.length, same: plan.same, activeNow,
      archive: plan.remove.filter(d => keepHistory.has(d.id)).length, delete: plan.remove.filter(d => !keepHistory.has(d.id)).length,
      sample: {
        add: plan.add.slice(0, 50).map(r => ({ name: r.name, clinic: r.clinic_name, city: r.city })),
        update: plan.update.slice(0, 50).map(x => ({ name: x.row.name, clinic: x.row.clinic_name, changes: x.changes, reactivate: x.reactivate })),
        remove: plan.remove.slice(0, 80).map(d => ({ name: d.name, clinic: d.clinic_name, city: d.city, archived: keepHistory.has(d.id) })),
      },
    };
    if (!apply) { await client.query("ROLLBACK"); return NextResponse.json({ preview: true, ...summary }); }
    if (activeNow > 0 && plan.remove.length / activeNow > BIG && sp.get("confirmBig") !== "1") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `الملف هيشيل ${plan.remove.length} من ${activeNow} طبيب — لازم تأكيد صريح` }, { status: 409 });
    }

    const failed = await write(client, plan, keepHistory);
    await client.query(`INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,'import','doctors','excel',$2)`,
      [u.id, JSON.stringify({ file: file.name, rows: summary.rows, add: summary.add - failed.length, update: summary.update, archive: summary.archive, delete: summary.delete, failed })]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, ...summary, failed });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("doctor import failed", e);
    return NextResponse.json({ error: "حصل خطأ ومفيش أي تغيير اتعمل في قاعدة البيانات" }, { status: 500 });
  } finally { client.release(); }
}

type Q = { query: (text: string, values?: unknown[]) => Promise<unknown> };
async function write(client: Q, plan: Plan, keepHistory: Set<string>) {
  const failed: Array<{ line: number; name: string }> = [];
  for (const x of plan.update) {
    const sets: string[] = []; const vals: unknown[] = [x.id];
    for (const [f, [, v]] of Object.entries(x.changes)) { vals.push(v); sets.push(`${f}=$${vals.length}`); }
    if (x.reactivate) sets.push("status='active'");
    await client.query("SAVEPOINT r");
    try { await client.query(`UPDATE doctors SET ${sets.join(",")} WHERE id=$1`, vals); await client.query("RELEASE SAVEPOINT r"); }
    catch { await client.query("ROLLBACK TO SAVEPOINT r"); failed.push({ line: x.row.line, name: x.row.name }); }
  }
  for (const r of plan.add) {
    // A savepoint per row: a clash with an old merged record skips that row instead of failing the whole import.
    await client.query("SAVEPOINT r");
    try {
      await client.query("INSERT INTO doctors(name,clinic_name,city,specialty,classification,phone,email,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')",
        [r.name, r.clinic_name, r.city, r.specialty, r.classification, r.phone, r.email]);
      await client.query("RELEASE SAVEPOINT r");
    } catch { await client.query("ROLLBACK TO SAVEPOINT r"); failed.push({ line: r.line, name: r.name }); }
  }
  const archive = plan.remove.filter(d => keepHistory.has(d.id)).map(d => d.id);
  const del = plan.remove.filter(d => !keepHistory.has(d.id)).map(d => d.id);
  if (archive.length) await client.query("UPDATE doctors SET status='inactive' WHERE id=ANY($1::uuid[])", [archive]);
  if (del.length) await client.query("DELETE FROM doctors WHERE id=ANY($1::uuid[])", [del]);
  return failed;
}
