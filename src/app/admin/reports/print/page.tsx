import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { findReport, getReportRows, parseReportFilters, type Col } from "@/lib/report-extra";
import AutoPrint from "./AutoPrint";

const STATUS: Record<string, string> = { completed: "مكتملة", planned: "مجدولة", cancelled: "ملغاة", follow_up: "متابعة" };
const APPROVAL: Record<string, string> = { pending: "بانتظار الموافقة", approved: "معتمد", rejected: "مرفوض" };
const PURPOSE: Record<string, string> = { personal_use: "استخدام شخصي", video_shooting: "تصوير فيديو", workshop: "ورشة" };
const LOC = "en-GB";
function show(c: Col, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (c.type) {
    case "datetime": return new Intl.DateTimeFormat(LOC, { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(String(v)));
    case "date": return String(v).slice(0, 10);
    case "money": return Number(v).toLocaleString("en-US");
    case "pct": return `${v}%`;
    case "status": return STATUS[String(v)] || String(v);
    case "approval": return APPROVAL[String(v)] || String(v);
    case "purpose": return PURPOSE[String(v)] || String(v);
    default: return String(v);
  }
}

// Printable report (browser "Save as PDF" renders Arabic correctly).
export default async function ReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const sp = new URLSearchParams(await searchParams);
  const def = findReport(sp.get("type") || "reps");
  if (!def) redirect("/admin/reports");
  const f = parseReportFilters(sp);
  const rows = await getReportRows(def.id, f, { unlimited: true });
  const parts = [`${f.from} → ${f.to}`];
  if (f.repId) parts.push((await query<{ name: string }>("SELECT name FROM users WHERE id=$1", [f.repId])).rows[0]?.name || "");
  if (f.productId) parts.push((await query<{ name: string }>("SELECT name FROM products WHERE id=$1", [f.productId])).rows[0]?.name || "");
  if (f.city) parts.push(f.city);
  if (f.status) parts.push(STATUS[f.status] || f.status);
  return (
    <div dir="rtl" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", padding: 24, color: "#16232b", background: "#fff", minHeight: "100vh" }}>
      <style>{`@page{size:A4 landscape;margin:12mm}@media print{.no-print{display:none!important}}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#10484f;color:#fff;text-align:right;padding:6px;font-weight:700}td{padding:5px 6px;border-bottom:1px solid #e3ecec;vertical-align:top}tr:nth-child(even) td{background:#f5f8f8}thead{display:table-header-group}tr{break-inside:avoid}`}</style>
      <AutoPrint />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #10484f", paddingBottom: 8, marginBottom: 12 }}>
        <div><div style={{ fontSize: 12, color: "#5f7177" }}>Elite Skin CRM</div><div style={{ fontSize: 20, fontWeight: 800, color: "#10484f" }}>{def.label}</div></div>
        <div style={{ fontSize: 12, color: "#5f7177", textAlign: "left" }}>{parts.filter(Boolean).join(" · ")}<br />{rows.length} صف</div>
      </div>
      <table><thead><tr>{def.columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{def.columns.map(c => <td key={c.key}>{show(c, r[c.key])}</td>)}</tr>)}</tbody></table>
      {!rows.length && <p style={{ textAlign: "center", color: "#5f7177", marginTop: 24 }}>لا توجد بيانات في هذه الفترة</p>}
    </div>
  );
}
