import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { periodRange } from "@/lib/visit-intel";
import { reportData } from "@/lib/visit-report";
import AutoPrint from "@/app/admin/reports/print/AutoPrint";

const BAND: Record<string, string> = { excellent: "ممتازة", good: "جيدة", weak: "ضعيفة" };
const fmt = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) => new Date(`${d}T12:00:00`).toLocaleDateString("ar-EG-u-nu-latn", o);

export default async function VisitsReportPrint({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.role !== "admin") redirect("/visits");
  const sp = await searchParams;
  const { from, to } = periodRange(sp.period || "week", sp.from, sp.to);
  const d = await reportData(from, to, sp.repId || undefined);
  const k = d.kpi; const planned = d.adherence.reduce((a, x) => a + x.planned, 0), done = d.adherence.reduce((a, x) => a + x.done, 0);
  const maxDay = Math.max(1, ...d.days.map(x => x.visits));
  const flagged = d.visits.filter(v => v.flags.some(f => f.tone === "red"));
  const scored = d.bands.excellent + d.bands.good + d.bands.weak || 1;
  const insights: string[] = [];
  if (k.bursts) insights.push(`${k.bursts} زيارة اتسجلت بشكل جماعي من نفس المكان لعيادات مختلفة — محتاجة مراجعة.`);
  if (planned && done / planned < 0.7) insights.push(`الالتزام بالخطة ${Math.round(done / planned * 100)}% بس — أقل من المستهدف 70%.`);
  if (d.products[0]) insights.push(`أكتر منتج اتعرض: ${d.products[0].name} (${d.products[0].total} مرة · اهتمام ${d.products[0].positivePct}%).`);
  const best = d.reps[0]; if (best && d.reps.length > 1) insights.push(`أعلى جودة زيارات: ${best.rep_name} (${best.avgQuality}/100).`);
  if (k.detailMin === 0 && k.visits) insights.push("مفيش عرض بروشورات اتسجل من صفحة المنتجات في الفترة دي.");
  return <div dir="rtl" className="report">
    <style>{`
      @page { size: A4; margin: 14mm 12mm; }
      body { background: #fff !important; }
      .report { font-family: inherit; color: #0f172a; max-width: 900px; margin: 0 auto; padding: 24px; }
      .report h2 { font-size: 15px; font-weight: 800; color: #10484f; margin: 22px 0 10px; border-right: 4px solid #33b3a6; padding-right: 8px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .tile { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; }
      .tile b { display: block; font-size: 22px; color: #10484f; }
      .tile span { font-size: 11px; color: #64748b; }
      table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      th { background: #10484f; color: #fff; padding: 6px; text-align: right; font-weight: 700; }
      td { border-bottom: 1px solid #e2e8f0; padding: 6px; vertical-align: top; }
      tr:nth-child(even) td { background: #f8fafc; }
      .pill { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 10.5px; font-weight: 700; }
      .no-print { } @media print { .no-print { display: none !important; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
    `}</style>
    <AutoPrint />
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #10484f", paddingBottom: 12 }}>
      <div><div style={{ fontSize: 22, fontWeight: 900, color: "#10484f" }}>تقرير الزيارات</div><div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>{from === to ? fmt(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${fmt(from)} — ${fmt(to)}`} · {d.repName || "كل الفريق"}</div></div>
      <div style={{ textAlign: "left" }}><div style={{ fontWeight: 900, letterSpacing: 4, color: "#10484f" }}>ELITE <span style={{ color: "#33b3a6" }}>SKIN</span></div><div style={{ fontSize: 10, color: "#94a3b8" }}>اتعمل {new Date().toLocaleString("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}</div></div>
    </header>
    <h2>الصورة العامة</h2>
    <div className="grid">
      <div className="tile"><b>{k.visits}</b><span>زيارة · {k.doctors} طبيب</span></div>
      <div className="tile"><b>{k.avgQuality}<small style={{ fontSize: 12, color: "#94a3b8" }}>/100</small></b><span>متوسط جودة الزيارة</span></div>
      <div className="tile"><b>{planned ? `${Math.round(done / planned * 100)}%` : "—"}</b><span>الالتزام بالخطة ({done}/{planned})</span></div>
      <div className="tile"><b style={{ color: k.redFlags ? "#b91c1c" : "#047857" }}>{k.redFlags}</b><span>تنبيهات مهمة</span></div>
      <div className="tile"><b>{k.positivePct}%</b><span>اهتمام بالمنتجات ({k.presented} عرض)</span></div>
      <div className="tile"><b>{k.detailMin}</b><span>دقيقة عرض بروشورات</span></div>
      <div className="tile"><b>{k.samples}</b><span>عينة · {k.orders} طلب</span></div>
      <div className="tile"><b>{k.plannedPct}%</b><span>زيارات من ضمن الخطة</span></div>
    </div>
    {insights.length > 0 && <><h2>أهم الملاحظات</h2><ul style={{ fontSize: 12.5, lineHeight: 1.9, paddingRight: 18, margin: 0 }}>{insights.map(x => <li key={x}>{x}</li>)}</ul></>}
    <h2>جودة الزيارات</h2>
    <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ width: `${d.bands.excellent / scored * 100}%`, background: "#059669" }} /><div style={{ width: `${d.bands.good / scored * 100}%`, background: "#f59e0b" }} /><div style={{ width: `${d.bands.weak / scored * 100}%`, background: "#ef4444" }} />
    </div>
    <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "#475569", marginTop: 6 }}><span>● ممتازة {d.bands.excellent}</span><span>● جيدة {d.bands.good}</span><span>● ضعيفة {d.bands.weak}</span></div>
    {d.days.length > 1 && <><h2>الزيارات يوم بيوم</h2>
      <svg viewBox={`0 -18 ${d.days.length * 60} 168`} style={{ width: "100%", height: 168 }}>
        {d.days.map((x, i) => { const h = x.visits / maxDay * 100; return <g key={x.day}><rect x={i * 60 + 12} y={110 - h} width={36} height={h} rx={5} fill="#10484f" /><text x={i * 60 + 30} y={104 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill="#10484f">{x.visits}</text><text x={i * 60 + 30} y={128} textAnchor="middle" fontSize="10" fill="#64748b">{fmt(x.day, { day: "numeric", month: "short" })}</text><text x={i * 60 + 30} y={143} textAnchor="middle" fontSize="9" fill="#94a3b8">جودة {x.avgQuality}</text></g>; })}
      </svg></>}
    {d.reps.length > 0 && <><h2>أداء المناديب</h2><table><thead><tr><th>المندوب</th><th>زيارات</th><th>أطباء</th><th>الجودة</th><th>الالتزام بالخطة</th><th>اهتمام بالمنتجات</th><th>تنبيهات</th></tr></thead><tbody>
      {d.reps.map(r => { const a = d.adherence.find(x => x.rep_id === r.rep_id); return <tr key={r.rep_id}><td><b>{r.rep_name}</b></td><td>{r.visits}</td><td>{r.doctors}</td><td><span className="pill" style={{ background: r.avgQuality >= 75 ? "#d1fae5" : r.avgQuality >= 50 ? "#fef3c7" : "#fee2e2" }}>{r.avgQuality}</span></td><td>{a ? `${a.done}/${a.planned}` : "—"}</td><td>{r.positivePct}%</td><td style={{ color: r.redFlags ? "#b91c1c" : undefined, fontWeight: 700 }}>{r.redFlags}</td></tr>; })}
    </tbody></table></>}
    {d.products.length > 0 && <><h2>المنتجات وردود فعل الأطباء</h2><table><thead><tr><th>المنتج</th><th>مرات العرض</th><th style={{ width: "45%" }}>ردود الفعل</th><th>اهتمام</th></tr></thead><tbody>
      {d.products.map(p => <tr key={p.product_id}><td><b>{p.name}</b></td><td>{p.total}</td><td><div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#f1f5f9" }}><div style={{ width: `${p.interested / p.total * 100}%`, background: "#059669" }} /><div style={{ width: `${p.neutral / p.total * 100}%`, background: "#94a3b8" }} /><div style={{ width: `${p.other / p.total * 100}%`, background: "#ef4444" }} /></div></td><td>{p.positivePct}%</td></tr>)}
    </tbody></table></>}
    {flagged.length > 0 && <><h2>زيارات محتاجة مراجعة ({flagged.length})</h2><table><thead><tr><th>التاريخ</th><th>المندوب</th><th>الطبيب / العيادة</th><th>السبب</th></tr></thead><tbody>
      {flagged.slice(0, 40).map(v => <tr key={v.id}><td>{fmt(v.day, { day: "numeric", month: "short" })} {v.hm}</td><td>{v.rep_name}</td><td>{v.doctor_name}<div style={{ color: "#64748b" }}>{v.clinic_name}</div></td><td style={{ color: "#b91c1c" }}>{v.flags.filter(f => f.tone === "red").map(f => f.label).join(" · ")}</td></tr>)}
    </tbody></table></>}
    <h2>تفاصيل الزيارات ({d.visits.length})</h2>
    <table><thead><tr><th>الوقت</th><th>المندوب</th><th>الطبيب</th><th>المنتجات</th><th>الجودة</th></tr></thead><tbody>
      {[...d.visits].sort((a, b) => a.visited_at < b.visited_at ? -1 : 1).slice(0, 300).map(v => <tr key={v.id}><td>{fmt(v.day, { day: "numeric", month: "short" })} {v.hm}</td><td>{v.rep_name}</td><td>{v.doctor_name} <span style={{ color: "#94a3b8" }}>{v.classification || ""}</span><div style={{ color: "#64748b" }}>{v.clinic_name}</div></td><td>{v.presented.map(p => p.name).join("، ") || "—"}</td><td>{v.status === "cancelled" ? "ملغاة" : v.score !== null ? `${v.score} · ${BAND[v.band!]}` : "—"}</td></tr>)}
    </tbody></table>
    <footer style={{ marginTop: 24, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>Elite Skin CRM · جودة الزيارة من 100: الموقع 25 · المحتوى 45 (منتجات/ملاحظات/عرض بروشور) · النتيجة 15 (عينات/متابعة) · الخطة 15</footer>
  </div>;
}
