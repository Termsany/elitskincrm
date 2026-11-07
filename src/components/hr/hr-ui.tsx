"use client";
import type { HrRow } from "@/lib/hr";

/** Shared bits for the employee-request screens (rep panel, admin board, home cards). */
export const KINDS = [
  { id: "leave", label: "إجازة", sub: "سنوية · مرضية · بدون راتب", icon: "calendar", color: "#33b3a6" },
  { id: "exit_reentry", label: "خروج وعودة", sub: "تأشيرة مفردة أو متعددة", icon: "travel", color: "#3b90e8" },
  { id: "advance", label: "سلفة", sub: "تتخصم من الراتب على أقساط", icon: "wallet", color: "#e16201" },
  { id: "salary_letter", label: "تعريف بالراتب", sub: "خطاب للبنك أو السفارة", icon: "file", color: "#9676e3" },
] as const;
export const kindOf = (k: string) => KINDS.find(x => x.id === k) || KINDS[0];
export const LEAVE: Record<string, string> = { annual: "سنوية", sick: "مرضية", unpaid: "بدون راتب" };

export const STATUS: Record<string, [string, string]> = {
  pending: ["مستني الموافقة", "bg-amber-50 text-amber-800 ring-amber-200"],
  reopened: ["مستني الموافقة", "bg-amber-50 text-amber-800 ring-amber-200"],
  in_progress: ["تحت التنفيذ", "bg-sky-50 text-sky-800 ring-sky-200"],
  deferred: ["مؤجل", "bg-slate-100 text-slate-700 ring-slate-200"],
  needs_info: ["محتاج توضيح منك", "bg-orange-50 text-orange-800 ring-orange-200"],
  approved: ["معتمد ✓", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  completed: ["جاهز ✓", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  closed: ["مقفول", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  rejected: ["مرفوض", "bg-red-50 text-red-700 ring-red-200"],
  cancelled: ["ملغي", "bg-slate-100 text-slate-500 ring-slate-200"],
};
export function StatusPill({ s }: { s: string }) {
  const [l, c] = STATUS[s] || [s, "bg-slate-100 text-slate-600 ring-slate-200"];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${c}`}>{l}</span>;
}
export const sar = (n: number | null | undefined, d = 0) => n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })} ر.س`;
export const dshort = (d: string | null) => d ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "—";
export const mlabel = (m: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1);
export const rel = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `من ${Math.max(1, m)} دقيقة` : m < 1440 ? `من ${Math.round(m / 60)} ساعة` : `من ${Math.round(m / 1440)} يوم`; };

/** One-line facts under a request title (dates, destination, amount…). */
export function facts(r: HrRow): string[] {
  const d = r.hr_details || {};
  if (r.kind === "leave") return [`${LEAVE[r.hr_type || ""] || ""}`, `${dshort(r.start_date)} ← ${dshort(r.end_date)}`, `${r.days} يوم`];
  if (r.kind === "exit_reentry") return [`تأشيرة ${r.hr_type === "multiple" ? "متعددة" : "مفردة"}`, `سفر ${dshort(r.start_date)}`, r.end_date ? `عودة ${dshort(r.end_date)}` : "", d.destination ? `إلى ${d.destination}` : ""].filter(Boolean);
  if (r.kind === "advance") return [sar(r.amount), `${r.installments} ${r.installments === 1 ? "قسط" : "أقساط"} × ${sar((r.amount || 0) / (r.installments || 1))}`, r.start_date ? `من ${mlabel(r.start_date.slice(0, 7))}` : ""].filter(Boolean);
  return [String(d.addressee || ""), d.language === "en" ? "إنجليزي" : "عربي", d.include_salary === false ? "من غير ذكر الراتب" : "بذكر الراتب"].filter(Boolean);
}

/** Animated balance ring (remaining of entitled). */
export function BalanceRing({ remaining, total, size = 88 }: { remaining: number; total: number; size?: number }) {
  const r = 34, L = 2 * Math.PI * r, p = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return <svg viewBox="0 0 84 84" width={size} height={size} className="shrink-0" aria-label={`${remaining} يوم متبقي من ${total}`}>
    <circle cx="42" cy="42" r={r} fill="none" stroke="var(--bg)" strokeWidth="9" />
    <circle cx="42" cy="42" r={r} fill="none" stroke={remaining <= 0 ? "#ef4b4e" : p < 0.25 ? "#e99608" : "#33b3a6"} strokeWidth="9" strokeLinecap="round" strokeDasharray={L}
      transform="rotate(-90 42 42)" className="es-hr-ring" style={{ ["--hr-len" as string]: `${L}`, strokeDashoffset: L * (1 - p) }} />
    <text x="42" y="40" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--navy)">{remaining}</text>
    <text x="42" y="56" textAnchor="middle" fontSize="9.5" fill="var(--muted)">من {total} يوم</text>
  </svg>;
}
