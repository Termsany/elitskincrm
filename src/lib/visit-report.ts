import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { enrichedVisits, summarize, planAdherence, type EVisit } from "@/lib/visit-intel";

const BAND: Record<string, string> = { excellent: "ممتازة", good: "جيدة", weak: "ضعيفة" };
const REACT: Record<string, string> = { interested: "مهتم", neutral: "محايد", not_interested: "غير مهتم" };

export async function reportData(from: string, to: string, repId?: string) {
  const visits = await enrichedVisits({ from, to, repId });
  const s = summarize(visits);
  const adh = await planAdherence(from, to, repId);
  const repName = repId ? (await query(`SELECT name FROM users WHERE id=$1`, [repId])).rows[0]?.name || "" : "";
  return { from, to, repId: repId || "", repName, visits, ...s, adherence: adh };
}

export async function buildWorkbook(d: Awaited<ReturnType<typeof reportData>>) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook(); wb.creator = "Elite Skin CRM"; wb.created = new Date();
  const NAVY = "FF10484F", LIGHT = "FFE8F4F3";
  const head = (ws: any, cols: Array<[string, number]>) => {
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; r.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; r.height = 22;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };
  const planned = d.adherence.reduce((a, x) => a + x.planned, 0), done = d.adherence.reduce((a, x) => a + x.done, 0);
  const s1 = wb.addWorksheet("ملخص", { views: [{ rightToLeft: true }] });
  s1.columns = [{ width: 34 }, { width: 22 }];
  s1.addRow([`تقرير الزيارات — Elite Skin`]).font = { bold: true, size: 16, color: { argb: NAVY } };
  s1.addRow([`الفترة: ${d.from} ← ${d.to}${d.repName ? ` · المندوب: ${d.repName}` : " · كل الفريق"}`]).font = { color: { argb: "FF64748B" } };
  s1.addRow([]);
  const k = d.kpi;
  const rows: Array<[string, string | number]> = [["عدد الزيارات", k.visits], ["أطباء مختلفين", k.doctors], ["عيادات مختلفة", k.clinics], ["متوسط جودة الزيارة (من 100)", k.avgQuality],
    ["زيارات ممتازة / جيدة / ضعيفة", `${d.bands.excellent} / ${d.bands.good} / ${d.bands.weak}`], ["الالتزام بالخطة المعتمدة", planned ? `${done}/${planned} (${Math.round(done / planned * 100)}%)` : "—"],
    ["زيارات من ضمن الخطة", `${k.plannedPct}%`], ["تنبيهات مهمة (موقع / تسجيل جماعي)", k.redFlags], ["منتجات اتعرضت", k.presented], ["نسبة الاهتمام بالمنتجات", `${k.positivePct}%`],
    ["دقائق عرض البروشورات", k.detailMin], ["عينات", k.samples], ["طلبات", k.orders], ["زيارات فيها متابعة", k.followups], ["زيارات ملغاة", k.cancelled]];
  for (const [a, b] of rows) { const r = s1.addRow([a, b]); r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }; r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { horizontal: "center" }; }
  const s2 = wb.addWorksheet("المناديب", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  head(s2, [["المندوب", 22], ["الزيارات", 10], ["أطباء", 10], ["متوسط الجودة", 13], ["من الخطة %", 12], ["الالتزام بالخطة", 16], ["تنبيهات", 10], ["عينات", 9], ["اهتمام بالمنتجات %", 16], ["دقائق عرض", 12]]);
  for (const r of d.reps) { const a = d.adherence.find(x => x.rep_id === r.rep_id); s2.addRow([r.rep_name, r.visits, r.doctors, r.avgQuality, r.plannedPct, a ? `${a.done}/${a.planned}` : "—", r.redFlags, r.samples, r.positivePct, r.detailMin]); }
  const s3 = wb.addWorksheet("الزيارات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  head(s3, [["التاريخ", 12], ["الوقت", 8], ["المندوب", 18], ["الطبيب", 22], ["التصنيف", 8], ["العيادة", 22], ["المدينة", 12], ["الحالة", 10], ["في الخطة", 9], ["الجودة", 8], ["التقييم", 9], ["المنتجات وردود الفعل", 36], ["عرض (ث)", 9], ["عينات", 7], ["طلبات", 7], ["متابعة", 12], ["الملاحظات", 40], ["تنبيهات", 40], ["دقة GPS (م)", 10], ["بعد عن العيادة (م)", 14]]);
  for (const v of [...d.visits].sort((a, b) => a.visited_at < b.visited_at ? -1 : 1)) {
    const r = s3.addRow([v.day, v.hm, v.rep_name, v.doctor_name, v.classification || "", v.clinic_name, v.city, v.status === "cancelled" ? "ملغاة" : v.status === "follow_up" ? "متابعة" : "مكتملة", v.planned ? "نعم" : "لا",
      v.score ?? "", v.band ? BAND[v.band] : "", v.presented.map(p => `${p.name} (${REACT[p.reaction] || p.reaction || "—"})`).join("، "), v.detail_sec, v.samples, v.orders, v.follow_up_at || "", v.notes, v.flags.map(f => f.label).join(" · "), v.accuracy_m !== null ? Math.round(v.accuracy_m) : "", v.distance_m ?? ""]);
    r.alignment = { vertical: "top", wrapText: true };
    if (v.band) r.getCell(11).font = { bold: true, color: { argb: v.band === "excellent" ? "FF047857" : v.band === "good" ? "FFB45309" : "FFB91C1C" } };
    if (v.flags.some(f => f.tone === "red")) r.getCell(18).font = { color: { argb: "FFB91C1C" }, bold: true };
  }
  const s4 = wb.addWorksheet("المنتجات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  head(s4, [["المنتج", 26], ["مرات العرض", 12], ["مهتم", 9], ["محايد", 9], ["أخرى", 9], ["نسبة الاهتمام %", 15], ["مناديب عرضوه", 14]]);
  for (const p of d.products) s4.addRow([p.name, p.total, p.interested, p.neutral, p.other, p.positivePct, p.reps]);
  const flagged = d.visits.filter((v: EVisit) => v.flags.some(f => f.tone === "red"));
  const s5 = wb.addWorksheet("التنبيهات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  head(s5, [["التاريخ", 12], ["الوقت", 8], ["المندوب", 18], ["الطبيب", 22], ["العيادة", 22], ["التنبيه", 60]]);
  for (const v of flagged) s5.addRow([v.day, v.hm, v.rep_name, v.doctor_name, v.clinic_name, v.flags.filter(f => f.tone === "red").map(f => f.label).join(" · ")]);
  if (!flagged.length) s5.addRow(["مفيش تنبيهات مهمة في الفترة دي ✓"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const reportFileName = (from: string, to: string, repName: string) => `تقرير الزيارات ${from === to ? from : `${from} إلى ${to}`}${repName ? ` - ${repName}` : ""}.xlsx`;

export async function saveReportToLibrary(ownerId: string, buf: Buffer, name: string, key: string, visibility: "private" | "team" = "private") {
  const r = await query(`INSERT INTO library_files(owner_id,name,folder,description,mime,size_bytes,data,sha256,visibility,source_kind,source_id)
    VALUES($1,$2,'تقارير الزيارات',$3,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$4,$5,$6,$7,'visit_report',$8) RETURNING id`,
    [ownerId, name, "تقرير مولّد تلقائيًا من صفحة الزيارات", buf.length, buf, createHash("sha256").update(buf).digest("hex"), visibility, key]);
  return r.rows[0].id as string;
}
