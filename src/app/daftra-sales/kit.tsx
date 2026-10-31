"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

export const sar = (n: number | null | undefined, d = 0) => n === null || n === undefined ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })}\u00a0ر.س`;
export const num = (n: number | null | undefined, d = 0) => n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
export const pct = (n: number | null | undefined) => n === null || n === undefined ? "—" : `${n.toFixed(1)}%`;
export const short = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 0 : 2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
export const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const mLabel = (m: string, full = false) => { const t = MONTHS[Number(m.slice(5, 7)) - 1] || m; return full ? `${t} ${m.slice(0, 4)}` : t.slice(0, 3); };
export const C = { green: "#1aa865", teal: "#15646a", mint: "#33b3a6", orange: "#e16201", red: "#c92f36", blue: "#3b90e8", amber: "#e99608", violet: "#9676e3", slate: "#637274" };

/** Small "?" that explains an accounting term in plain words. */
export function Hint({ text }: { text: string }) {
  const [o, setO] = useState(false);
  return <span className="relative inline-flex align-middle"><button type="button" onClick={e => { e.stopPropagation(); setO(!o); }} onBlur={() => setO(false)} aria-label="شرح" className="mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg)] text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--navy)]">؟</button>
    {o && <span className="absolute right-0 top-6 z-40 w-64 rounded-xl bg-[#0b1d20] p-3 text-[11.5px] font-normal leading-5 text-white shadow-2xl">{text}</span>}</span>;
}

export function Kpi({ label, value, sub, icon, color = C.teal, hint, onClick, tone }: { label: string; value: string; sub?: React.ReactNode; icon: string; color?: string; hint?: string; onClick?: () => void; tone?: "good" | "bad" }) {
  const El = onClick ? "button" : "div";
  return <El type={onClick ? "button" : undefined} onClick={onClick} className={`group rounded-2xl border border-[var(--border)] bg-white p-4 text-right transition ${onClick ? "hover:-translate-y-0.5 hover:border-[var(--sky-border)] hover:shadow-lg" : ""}`}>
    <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-[var(--muted)]">{label}{hint && <Hint text={hint} />}</span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ color, background: `${color}1f` }}><Icon name={icon} size={18} /></span></div>
    <div className={`mt-2 text-xl font-extrabold sm:text-2xl ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-[var(--navy)]"}`}>{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    {onClick && <div className="mt-1 text-[10.5px] font-bold text-[var(--sky-deep)] opacity-0 transition group-hover:opacity-100">التفاصيل ‹</div>}
  </El>;
}

export function Card({ title, hint, right, children, className = "" }: { title?: string; hint?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4 ${className}`}>
    {(title || right) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">{title && <h3 className="font-extrabold text-[var(--navy)]">{title}{hint && <Hint text={hint} />}</h3>}{right}</div>}
    {children}
  </section>;
}

export function ExcelBtn({ href, label = "Excel" }: { href: string; label?: string }) {
  return <a href={href} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"><Icon name="reports" size={14} />{label}</a>;
}

/** Horizontal share bars (top N) — clickable rows. */
export function Bars({ rows, color = C.mint, onPick, valueLabel }: { rows: Array<{ label: string; value: number; sub?: string }>; color?: string; onPick?: (label: string) => void; valueLabel?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return <div className="space-y-2.5">{rows.map(r => <button key={r.label} type="button" disabled={!onPick} onClick={() => onPick?.(r.label)} className="block w-full text-right disabled:cursor-default">
    <div className="mb-1 flex justify-between gap-2 text-xs"><span className="min-w-0 truncate font-bold" dir="auto">{r.label}</span><span className="shrink-0 font-bold">{valueLabel ? valueLabel(r.value) : sar(r.value)}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.abs(r.value) / max * 100}%`, background: r.value < 0 ? C.red : color }} /></div>
    {r.sub && <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">{r.sub}</div>}
  </button>)}</div>;
}

/** Monthly grouped bars with hover read-out; clicking a month drills into it. */
export function MonthChart({ data, series, onPick, height = 190 }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; label: string; color: string }>; onPick?: (m: string) => void; height?: number }) {
  const [h, setH] = useState<number | null>(null);
  const vals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals), span = max - min || 1, zero = max / span * 100;
  return <div>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><div className="h-5 text-xs text-[var(--muted)]">{h !== null ? <span><b className="text-[var(--navy)]">{mLabel(String(data[h].m), true)}</b>{series.map(s => <span key={s.key}> · {s.label} <b style={{ color: s.color }}>{sar(Number(data[h][s.key]))}</b></span>)}</span> : onPick ? "مرّر على أي شهر — واضغط عشان تشوف تفاصيله" : "مرّر على أي شهر"}</div>
      <div className="flex gap-3 text-[11px] text-[var(--muted)]">{series.map(s => <span key={s.key} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div></div>
    <div className="relative flex items-stretch gap-1 sm:gap-2" style={{ height }}>
      <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--border-strong)]" style={{ top: `${zero}%` }} />
      {data.map((d, i) => <button type="button" key={String(d.m)} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} onClick={() => onPick?.(String(d.m))} className={`relative flex min-w-0 flex-1 items-stretch justify-center gap-0.5 rounded-lg ${h === i ? "bg-[var(--sky-light)]" : ""}`}>
        {series.map(s => { const v = Number(d[s.key]) || 0, hgt = Math.abs(v) / span * 100; return <div key={s.key} className="relative w-full max-w-5"><div className={`absolute inset-x-0 ${v >= 0 ? "rounded-t" : "rounded-b"} transition-all duration-700`} style={{ background: s.color, height: `${hgt}%`, ...(v >= 0 ? { bottom: `${100 - zero}%` } : { top: `${zero}%` }), opacity: h === null || h === i ? 1 : 0.55 }} /></div>; })}
      </button>)}
    </div>
    <div className="mt-1 flex gap-1 sm:gap-2">{data.map((d, i) => <span key={String(d.m)} className={`min-w-0 flex-1 truncate text-center text-[9.5px] ${h === i ? "font-bold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{mLabel(String(d.m))}</span>)}</div>
  </div>;
}

/** Sortable, searchable table. */
export type Column<T> = { key: string; label: string; render?: (r: T) => React.ReactNode; value?: (r: T) => number | string | null; className?: string; hint?: string };
export function Table<T extends Record<string, unknown>>({ rows, cols, search, initialSort, rowKey, empty = "لا توجد بيانات", expand, max = 200 }: { rows: T[]; cols: Array<Column<T>>; search?: (r: T) => string; initialSort?: [string, 1 | -1]; rowKey: (r: T) => string; empty?: string; expand?: (r: T) => React.ReactNode; max?: number }) {
  const [q, setQ] = useState(""); const [sort, setSort] = useState<[string, 1 | -1] | null>(initialSort || null); const [open, setOpen] = useState<string | null>(null); const [all, setAll] = useState(false);
  const list = useMemo(() => {
    let l = search && q ? rows.filter(r => search(r).toLowerCase().includes(q.toLowerCase())) : rows;
    if (sort) { const c = cols.find(x => x.key === sort[0]); const v = (r: T) => c?.value ? c.value(r) : (r[sort[0]] as number | string | null); l = [...l].sort((a, b) => { const x = v(a), y = v(b); if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar")) * sort[1]; }); }
    return l;
  }, [rows, q, sort, cols, search]);
  return <div>
    {search && <div className="mb-2 flex items-center gap-2"><div className="relative flex-1"><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث…" className="w-full rounded-xl border border-[var(--border)] py-2 pl-3 pr-9 text-sm" /><span className="absolute right-3 top-2.5 text-[var(--muted)]"><Icon name="search" size={16} /></span></div><span className="text-xs text-[var(--muted)]">{list.length} سطر</span></div>}
    <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[640px] text-sm">
      <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr>{cols.map(c => <th key={c.key} className={`whitespace-nowrap p-2.5 font-bold ${c.className || "text-center"}`}><button type="button" onClick={() => setSort(s => s && s[0] === c.key ? [c.key, s[1] === 1 ? -1 : 1] : [c.key, -1])} className="inline-flex items-center gap-1 hover:text-[var(--navy)]">{c.label}{c.hint && <Hint text={c.hint} />}{sort?.[0] === c.key && <span>{sort[1] === 1 ? "▲" : "▼"}</span>}</button></th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{(all ? list : list.slice(0, max)).map(r => { const k = rowKey(r); return [<tr key={k} onClick={expand ? () => setOpen(open === k ? null : k) : undefined} className={`${expand ? "cursor-pointer" : ""} transition hover:bg-[var(--sky-light)]/60 ${open === k ? "bg-[var(--sky-light)]" : ""}`}>{cols.map(c => <td key={c.key} className={`p-2.5 ${c.className || "text-center"}`}>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}</tr>,
        open === k && expand ? <tr key={`${k}-x`}><td colSpan={cols.length} className="bg-[var(--bg)] p-3">{expand(r)}</td></tr> : null]; })}
        {!list.length && <tr><td colSpan={cols.length} className="p-8 text-center text-[var(--muted)]">{empty}</td></tr>}</tbody></table></div>
    {list.length > max && !all && <button type="button" onClick={() => setAll(true)} className="mt-2 w-full rounded-xl bg-[var(--bg)] py-2 text-xs font-bold text-[var(--navy)]">عرض الكل ({list.length})</button>}
  </div>;
}

export const STATUS_PAY: Record<number, [string, string]> = { 0: ["غير مدفوعة", "bg-red-50 text-red-700 ring-red-200"], 1: ["جزئي", "bg-amber-50 text-amber-800 ring-amber-200"], 2: ["مدفوعة", "bg-emerald-50 text-emerald-700 ring-emerald-200"], 3: ["مرتجعة", "bg-slate-100 text-slate-600 ring-slate-200"] };
export function Pill({ text, cls }: { text: string; cls: string }) { return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${cls}`}>{text}</span>; }
export const AGE: Array<[string, string, string]> = [["current", "لسه ما استحقتش", C.blue], ["1-30", "متأخر 1–30 يوم", C.amber], ["31-60", "31–60 يوم", C.orange], ["61-90", "61–90 يوم", C.red], ["90+", "أكتر من 90 يوم", "#7f151c"]];
