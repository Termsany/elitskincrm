"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { HubData, Kpi, Tone } from "@/lib/report-hub";

/** The five decision reports, used on screen and (with print) in the PDF pages — same look, all rows when printed. */
export type Pick = (p: { repId?: string; city?: string; view?: string }) => void;
type P<K extends keyof HubData> = { d: HubData[K]; pick?: Pick; print?: boolean };

const n0 = (n: number | null | undefined) => n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
export const sar = (n: number | null | undefined) => n === null || n === undefined ? "—" : `${n0(n)} ر.س`;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mShort = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]?.slice(0, 3) || m;
const TONE: Record<Tone, string> = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-600", info: "text-[var(--navy)]" };
const BAR: Record<Tone, string> = { good: "#1aa865", warn: "#e99608", bad: "#c92f36", info: "#3b90e8" };

export function Delta({ v, invert = false }: { v: number | null | undefined; invert?: boolean }) {
  if (v === null || v === undefined) return <span className="text-[11px] text-[var(--muted)]">—</span>;
  const up = v >= 0, good = invert ? !up : up;
  return <span className={`whitespace-nowrap text-[11px] font-bold ${v === 0 ? "text-[var(--muted)]" : good ? "text-emerald-600" : "text-red-600"}`}>{v === 0 ? "=" : up ? "▲" : "▼"} {Math.abs(v)}%</span>;
}

function Section({ title, right, children, print }: { title: string; right?: React.ReactNode; children: React.ReactNode; print?: boolean }) {
  return <section className={`rounded-[22px] border border-[var(--border)] bg-white p-4 ${print ? "break-inside-avoid-page" : "shadow-sm"}`}>
    <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-extrabold text-[var(--navy)]">{title}</h3><div className="mr-auto">{right}</div></div>{children}</section>;
}

export function KpiTile({ k, onClick }: { k: Kpi; onClick?: () => void }) {
  const v = k.unit === "sar" ? sar(k.value) : k.unit === "pct" ? `${k.value}%` : n0(k.value);
  const d = k.prev ? Math.round((k.value - k.prev) / Math.abs(k.prev) * 100) : null;
  const p = k.target ? Math.min(100, Math.round(k.value / k.target * 100)) : null;
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} className="rounded-[20px] border border-[var(--border)] bg-white p-3.5 text-right shadow-sm transition hover:border-[var(--sky)]">
    <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]"><span>{k.label}</span>{k.prev !== null && <Delta v={d} />}</div>
    <div className={`mt-1 text-[22px] font-black leading-tight ${TONE[k.tone]}`}>{v}</div>
    {p !== null && k.unit !== "pct" && k.id !== "score" ? <div className="mt-2"><div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full" style={{ width: `${p}%`, background: BAR[k.tone] }} /></div>
      <div className="mt-1 text-[10.5px] text-[var(--muted)]">{p}% من {k.unit === "sar" ? sar(k.target) : n0(k.target)}</div></div>
      : k.prev !== null ? <div className="mt-1 text-[10.5px] text-[var(--muted)]">الفترة اللي قبلها {k.unit === "sar" ? sar(k.prev) : n0(k.prev)}</div> : null}
  </Tag>;
}

/** Monthly bars (sales) with an optional line (net profit). */
export function Trend({ rows, line }: { rows: Array<{ month: string; sales: number; net?: number | null }>; line?: boolean }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-[var(--muted)]">مفيش بيانات</p>;
  const W = 640, H = 170, pad = 22, max = Math.max(1, ...rows.map(r => r.sales), ...rows.map(r => r.net ?? 0)), min = Math.min(0, ...rows.map(r => r.net ?? 0));
  const bw = (W - pad * 2) / rows.length, y = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / (max - min || 1));
  const pts = rows.map((r, i) => r.net === null || r.net === undefined ? null : `${W - pad - (i + 0.5) * bw},${y(r.net)}`).filter(Boolean).join(" ");
  return <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label="الاتجاه الشهري">
    <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="#dbe5ea" />
    {rows.map((r, i) => { const x = W - pad - (i + 1) * bw + bw * 0.18; return <g key={r.month}>
      <rect x={x} y={y(r.sales)} width={bw * 0.64} height={Math.max(1, y(0) - y(r.sales))} rx={4} fill="#9fd7cf"><title>{`${mShort(r.month)}: ${sar(r.sales)}`}</title></rect>
      <text x={x + bw * 0.32} y={H + 12} textAnchor="middle" fontSize="10" fill="#5f7177">{mShort(r.month)}</text></g>; })}
    {line && pts && <polyline points={pts} fill="none" stroke="#10484f" strokeWidth={2.5} strokeLinejoin="round" />}
    {line && rows.map((r, i) => r.net === null || r.net === undefined ? null : <circle key={i} cx={W - pad - (i + 0.5) * bw} cy={y(r.net)} r={3.5} fill={r.net < 0 ? "#c92f36" : "#10484f"}><title>{`صافي ${mShort(r.month)}: ${sar(r.net)}`}</title></circle>)}
  </svg>;
}

/** Horizontal bars for a ranked list. */
export function Bars({ rows, onPick, money = true }: { rows: Array<{ label: string; value: number; sub?: React.ReactNode; key?: string }>; onPick?: (k: string) => void; money?: boolean }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return <ul className="space-y-2">{rows.map(r => <li key={r.key || r.label}>
    <button type="button" disabled={!onPick} onClick={() => onPick?.(r.key || r.label)} className="w-full text-right disabled:cursor-default">
      <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate font-bold" dir="auto">{r.label}</span><span className="shrink-0 font-extrabold text-[var(--navy)]">{money ? sar(r.value) : n0(r.value)} {r.sub}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-teal-500/80" style={{ width: `${Math.abs(r.value) / max * 100}%` }} /></div>
    </button></li>)}</ul>;
}

type Col<T> = { key: keyof T & string; label: string; fmt?: (v: T[keyof T], r: T) => React.ReactNode; num?: boolean };
/** Sortable table; on screen shows the first rows with "show all", printed shows everything. */
export function RankTable<T extends Record<string, unknown>>({ rows, cols, onRow, print, first = 12, empty = "مفيش بيانات" }: { rows: T[]; cols: Array<Col<T>>; onRow?: (r: T) => void; print?: boolean; first?: number; empty?: string }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null); const [all, setAll] = useState(false);
  const list = useMemo(() => !sort ? rows : [...rows].sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "ar")) * sort.dir; }), [rows, sort]);
  if (!rows.length) return <p className="py-5 text-center text-sm text-[var(--muted)]">{empty}</p>;
  const shown = print || all ? list : list.slice(0, first);
  return <div className="overflow-x-auto"><table className="w-full text-[13px]">
    <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">{cols.map(c => <th key={c.key} className={`whitespace-nowrap p-2 font-bold ${c.num ? "text-center" : "text-right"}`}>
      {print ? c.label : <button type="button" onClick={() => setSort(s => ({ k: c.key, dir: s?.k === c.key && s.dir === -1 ? 1 : -1 }))} className="font-bold">{c.label}{sort?.k === c.key ? (sort.dir === -1 ? " ▾" : " ▴") : ""}</button>}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--border)]">{shown.map((r, i) => <tr key={i} onClick={onRow ? () => onRow(r) : undefined} className={onRow && !print ? "cursor-pointer hover:bg-[var(--bg)]" : ""}>
      {cols.map(c => <td key={c.key} className={`p-2 ${c.num ? "text-center tabular-nums" : ""}`} dir={c.num ? undefined : "auto"}>{c.fmt ? c.fmt(r[c.key], r) : (r[c.key] as React.ReactNode) ?? "—"}</td>)}</tr>)}</tbody>
  </table>{!print && list.length > first && <button type="button" onClick={() => setAll(x => !x)} className="mt-2 w-full rounded-xl bg-[var(--bg)] py-2 text-xs font-bold text-[var(--navy)]">{all ? "أقل" : `كل الصفوف (${list.length})`}</button>}</div>;
}

const deltaCol = { key: "delta" as const, label: "التغيير", num: true, fmt: (v: unknown) => <Delta v={v as number | null} /> };

export function SummaryView({ d, pick, print }: P<"summary">) {
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">{d.kpis.map(k => <KpiTile key={k.id} k={k} onClick={pick && !print ? () => pick({ view: k.view }) : undefined} />)}</div>
    <Section print={print} title="محتاج قرارك" right={d.more ? <span className="text-[11px] text-[var(--muted)]">+{d.more} تانيين</span> : null}>
      {!d.decisions.length ? <p className="py-4 text-center text-sm text-emerald-700">✓ مفيش حاجة عاجلة</p> : <ol className="space-y-2">{d.decisions.map((x, i) => <li key={i}>
        <Link href={x.href} className={`flex items-start gap-3 rounded-2xl border p-3 transition hover:shadow-sm ${x.level === "danger" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black text-white ${x.level === "danger" ? "bg-red-600" : "bg-amber-500"}`}>{i + 1}</span>
          <span className="min-w-0 flex-1"><b className="block text-[14px] text-[var(--ink)]" dir="auto">{x.text}</b>{x.detail && <span className="text-[12px] text-[var(--muted)]" dir="auto">{x.detail}</span>}</span>
          {!print && <span className="shrink-0 self-center text-xs font-bold text-teal-700">افتح ←</span>}
        </Link></li>)}</ol>}
    </Section>
  </div>;
}

export function SalesView({ d, pick, print }: P<"sales">) {
  const t = d.totals;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      <KpiTile k={{ id: "s", label: "المبيعات", value: t.sales, unit: "sar", prev: t.prev, target: null, tone: (t.delta ?? 0) >= 0 ? "good" : "warn", view: "sales" }} />
      {t.gross !== undefined && <KpiTile k={{ id: "g", label: `ربح البضاعة · ${t.gross_margin ?? 0}%`, value: t.gross, unit: "sar", prev: null, target: null, tone: "info", view: "sales" }} />}
      {t.opex !== undefined && <KpiTile k={{ id: "o", label: "المصاريف", value: t.opex, unit: "sar", prev: null, target: null, tone: "info", view: "sales" }} />}
      {t.net !== undefined && <KpiTile k={{ id: "n", label: `صافي الربح · ${t.net_margin ?? 0}%`, value: t.net, unit: "sar", prev: t.net_prev ?? null, target: null, tone: t.net < 0 ? "bad" : "good", view: "sales" }} />}
    </div>
    <Section print={print} title="آخر 12 شهر" right={d.company ? <span className="text-[11px] text-[var(--muted)]">الأعمدة مبيعات · الخط صافي الربح</span> : null}><Trend rows={d.trend} line={d.company} /></Section>
    <div className="grid gap-4 xl:grid-cols-2">
      <Section print={print} title="حسب المندوب"><Bars rows={d.byRep.map(r => ({ key: r.id, label: r.name, value: r.sales, sub: <Delta v={r.delta} /> }))} onPick={pick && !print ? k => k && pick({ repId: k }) : undefined} /></Section>
      <Section print={print} title="حسب المدينة"><Bars rows={d.byCity.map(r => ({ label: r.name, value: r.sales, sub: <Delta v={r.delta} /> }))} onPick={pick && !print ? k => pick({ city: k }) : undefined} /></Section>
    </div>
    <Section print={print} title="الأصناف"><RankTable print={print} rows={d.byItem} cols={[{ key: "name", label: "الصنف" }, { key: "qty", label: "الكمية", num: true, fmt: v => n0(v as number) }, { key: "sales", label: "المبيعات", num: true, fmt: v => sar(v as number) },
      { key: "prev", label: "قبلها", num: true, fmt: v => sar(v as number) }, deltaCol, { key: "gross", label: "ربح البضاعة", num: true, fmt: v => v === null ? "—" : <span className={(v as number) < 0 ? "font-bold text-red-600" : ""}>{sar(v as number)}</span> },
      { key: "margin", label: "الهامش", num: true, fmt: v => v === null ? "—" : <span className={(v as number) < 15 ? "font-bold text-red-600" : ""}>{v as number}%</span> }]} /></Section>
    <Section print={print} title="العملاء"><RankTable print={print} rows={d.clients} onRow={pick && !print ? r => r.city && pick({ city: r.city }) : undefined} cols={[{ key: "name", label: "العميل" }, { key: "city", label: "المدينة" },
      { key: "sales", label: "المبيعات", num: true, fmt: v => sar(v as number) }, { key: "prev", label: "قبلها", num: true, fmt: v => sar(v as number) }, deltaCol]} /></Section>
    {d.losses.length > 0 && <Section print={print} title={`بيع تحت التكلفة (${d.losses.length})`}><RankTable print={print} rows={d.losses} cols={[{ key: "date", label: "التاريخ" }, { key: "no", label: "الفاتورة" }, { key: "client", label: "العميل" }, { key: "item", label: "الصنف" },
      { key: "qty", label: "الكمية", num: true }, { key: "price", label: "السعر", num: true, fmt: v => sar(v as number) }, { key: "cost", label: "التكلفة", num: true, fmt: v => sar(v as number) }, { key: "lost", label: "الخسارة", num: true, fmt: v => <b className="text-red-600">{sar(v as number)}</b> }]} /></Section>}
  </div>;
}

export function RepsView({ d, pick, print }: P<"reps">) {
  const [cmp, setCmp] = useState<string[]>([]);
  const pair = d.rows.filter(r => cmp.includes(r.id));
  const tone = (s: number | null) => s === null ? "" : s >= 80 ? "text-emerald-700" : s >= 60 ? "text-amber-700" : "text-red-600";
  const pc = (v: number | null) => v === null ? "—" : <span className={tone(v)}>{v}%</span>;
  return <div className="space-y-4">
    {pair.length === 2 && !print && <Section title="مقارنة" right={<button type="button" onClick={() => setCmp([])} className="text-xs font-bold text-[var(--muted)]">✕</button>}>
      <table className="w-full text-[13px]"><thead><tr className="text-[11px] text-[var(--muted)]"><th className="p-2 text-right" />{pair.map(r => <th key={r.id} className="p-2 text-center text-[var(--navy)]" dir="auto">{r.name}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{([["التقييم", (r: typeof pair[0]) => r.score ?? "—"], ["المبيعات", r => sar(r.sales)], ["من التارجت", r => pc(r.sales_pct)], ["الزيارات", r => n0(r.visits)], ["الالتزام بالخطة", r => pc(r.plan_pct)],
          ["تغطية A", r => r.a], ["جودة الزيارات", r => pc(r.quality)], ["إلغاءات", r => r.cancelled], ["أيام من غير شغل", r => r.idle], ["مديونية عملاؤه", r => sar(r.overdue)]] as Array<[string, (r: typeof pair[0]) => React.ReactNode]>).map(([l, f]) =>
          <tr key={l}><td className="p-2 text-[12px] text-[var(--muted)]">{l}</td>{pair.map(r => <td key={r.id} className="p-2 text-center font-bold">{f(r)}</td>)}</tr>)}</tbody></table>
    </Section>}
    <Section print={print} title={`المناديب · تقييم ${d.month}`} right={!print ? <span className="text-[11px] text-[var(--muted)]">{cmp.length === 1 ? "اختار مندوب تاني للمقارنة" : "علّم على اتنين للمقارنة"}</span> : null}>
      <RankTable print={print} rows={d.rows.map(r => ({ ...r, pick: r.id }))} onRow={pick && !print ? r => pick({ repId: r.id }) : undefined} first={50} cols={[
        ...(!print ? [{ key: "pick" as const, label: "", fmt: (v: unknown) => <input type="checkbox" aria-label="قارن" checked={cmp.includes(String(v))} onClick={e => e.stopPropagation()} onChange={() => setCmp(c => c.includes(String(v)) ? c.filter(x => x !== v) : [...c.slice(-1), String(v)])} /> }] : []),
        { key: "name", label: "المندوب" }, { key: "score", label: "التقييم", num: true, fmt: (v, r) => <span><b className={`text-[15px] ${tone(v as number | null)}`}>{(v as number | null) ?? "—"}</b>{r.prev_score !== null && v !== null ? <span className="mr-1"><Delta v={(v as number) - (r.prev_score as number)} /></span> : null}</span> },
        { key: "sales", label: "المبيعات", num: true, fmt: v => sar(v as number) }, { key: "sales_pct", label: "من التارجت", num: true, fmt: v => pc(v as number | null) },
        { key: "visits", label: "الزيارات", num: true, fmt: (v, r) => <span>{n0(v as number)} <Delta v={r.visits_prev ? Math.round(((v as number) - (r.visits_prev as number)) / (r.visits_prev as number) * 100) : null} /></span> },
        { key: "plan_pct", label: "الخطة", num: true, fmt: v => pc(v as number | null) }, { key: "a", label: "تغطية A", num: true }, { key: "quality", label: "الجودة", num: true, fmt: v => pc(v as number | null) },
        { key: "cancelled", label: "إلغاء", num: true }, { key: "weakest", label: "أضعف بند", fmt: v => (v as string) || "—" }]} />
    </Section>
  </div>;
}

export function MarketView({ d, pick, print }: P<"market">) {
  return <div className="space-y-4">
    <Section print={print} title={`عملاء بطّلوا أو قلّلوا (${d.declining.length})`}><RankTable print={print} rows={d.declining} empty="✓ مفيش عملاء بيقلّوا" cols={[{ key: "name", label: "العميل" }, { key: "rep", label: "المندوب", fmt: v => (v as string) || "—" },
      { key: "status", label: "الحالة", fmt: v => v === "stopped" ? <b className="text-red-600">وقف</b> : <b className="text-amber-700">بيقل</b> }, { key: "days", label: "من آخر طلب", num: true, fmt: v => v === null ? "—" : `${v} يوم` },
      { key: "change", label: "التغيير", num: true, fmt: v => <Delta v={v === null ? null : Math.round(v as number)} /> }, { key: "monthly", label: "متوسطه الشهري", num: true, fmt: v => sar(v as number) },
      ...(!print ? [{ key: "doctor_id" as const, label: "", fmt: (v: unknown) => v ? <Link href={`/doctors/${v}`} className="text-xs font-bold text-teal-700">افتح</Link> : null }] : [])]} /></Section>
    <Section print={print} title={`جه ميعاد طلبهم (${d.reorder.length})`}><RankTable print={print} rows={d.reorder} empty="مفيش عيادات قرب ميعادها" cols={[{ key: "clinic", label: "العيادة" }, { key: "next", label: "الميعاد المتوقع" },
      { key: "days_to", label: "بعد", num: true, fmt: v => (v as number) < 0 ? <b className="text-red-600">متأخر {-(v as number)} يوم</b> : `${v} يوم` }, { key: "gap", label: "كل", num: true, fmt: v => `${v} يوم` },
      { key: "monthly", label: "متوسطه الشهري", num: true, fmt: v => sar(v as number) }, { key: "top", label: "بيطلب" }]} /></Section>
    <Section print={print} title="المدن"><RankTable print={print} rows={d.cities} onRow={pick && !print ? r => pick({ city: r.city }) : undefined} cols={[{ key: "city", label: "المدينة" }, { key: "doctors", label: "أطباء", num: true },
      { key: "coverage", label: "اتزاروا", num: true, fmt: (v, r) => <span>{n0(r.visited as number)} <span className="text-[var(--muted)]">({(v as number | null) ?? 0}%)</span></span> }, { key: "visits", label: "زيارات", num: true },
      { key: "a_unseen", label: "A ما اتزاروش", num: true, fmt: (v, r) => (v as number) ? <b className="text-red-600">{v as number}/{r.a as number}</b> : (r.a as number) ? "✓" : "—" },
      { key: "sales", label: "المبيعات", num: true, fmt: v => sar(v as number) }, { key: "sales_delta", label: "التغيير", num: true, fmt: v => <Delta v={v as number | null} /> }]} /></Section>
    <div className="grid gap-4 xl:grid-cols-2">
      <Section print={print} title="بيكبروا"><Bars rows={d.growing.map(x => ({ label: x.name, value: x.sales, sub: <Delta v={x.delta} /> }))} /></Section>
      <Section print={print} title="عملاء جداد في الفترة"><Bars rows={d.newClients.map(x => ({ label: x.name, value: x.sales }))} /></Section>
    </div>
  </div>;
}

const BUCKET: Array<[string, string, string]> = [["current", "لسه ما استحقتش", "#3b90e8"], ["1-30", "1–30 يوم", "#e99608"], ["31-60", "31–60", "#e16201"], ["61-90", "61–90", "#c92f36"], ["90+", "أكتر من 90", "#8a1c22"]];
export function MoneyView({ d, print }: P<"money">) {
  const k = d.kpi, tot = Object.values(d.buckets).reduce((s, v) => s + Number(v || 0), 0) || 1;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      <KpiTile k={{ id: "ar", label: "مستحق على العملاء", value: k.ar, unit: "sar", prev: null, target: null, tone: k.overdue > k.ar * 0.5 ? "bad" : "info", view: "money" }} />
      <KpiTile k={{ id: "od", label: "منه متأخر", value: k.overdue, unit: "sar", prev: null, target: null, tone: k.overdue ? "warn" : "good", view: "money" }} />
      <KpiTile k={{ id: "c", label: "اتحصّل في الفترة", value: k.collected, unit: "sar", prev: k.collected_prev, target: null, tone: k.collected >= k.collected_prev ? "good" : "warn", view: "money" }} />
      <KpiTile k={{ id: "e", label: "متوقع يتحصّل خلال 30 يوم", value: k.expected_30, unit: "sar", prev: null, target: null, tone: "info", view: "money" }} />
    </div>
    <Section print={print} title="أعمار الديون">
      <div className="flex h-5 overflow-hidden rounded-full">{BUCKET.map(([b, , c]) => Number(d.buckets[b] || 0) > 0 && <div key={b} style={{ width: `${Number(d.buckets[b]) / tot * 100}%`, background: c }} title={sar(Number(d.buckets[b]))} />)}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">{BUCKET.map(([b, l, c]) => <span key={b} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l} <b>{sar(Number(d.buckets[b] || 0))}</b></span>)}</div>
    </Section>
    <Section print={print} title="المبيعات والتحصيل والمصاريف · آخر 12 شهر">
      <RankTable print={print} rows={d.monthly.slice().reverse()} first={12} cols={[{ key: "month", label: "الشهر" }, { key: "sales", label: "المبيعات", num: true, fmt: v => sar(v as number) }, { key: "collected", label: "التحصيل", num: true, fmt: v => sar(v as number) },
        { key: "opex", label: "المصاريف", num: true, fmt: (v, r) => <span>{sar(v as number)} <span className="text-[11px] text-[var(--muted)]">{(r.sales as number) ? `${Math.round((v as number) / (r.sales as number) * 100)}%` : ""}</span></span> }]} />
    </Section>
    <div className="grid gap-4 xl:grid-cols-2">
      <Section print={print} title="أكبر المتأخرين"><RankTable print={print} rows={d.debtors} cols={[{ key: "name", label: "العميل" }, { key: "overdue", label: "متأخر", num: true, fmt: v => <b className="text-red-600">{sar(v as number)}</b> },
        { key: "unpaid", label: "الإجمالي", num: true, fmt: v => sar(v as number) }, { key: "oldest", label: "أقدم", num: true, fmt: v => `${v} يوم` }]} /></Section>
      <Section print={print} title="مستحق خلال 30 يوم"><RankTable print={print} rows={d.upcoming} cols={[{ key: "party", label: "العميل" }, { key: "no", label: "الفاتورة" }, { key: "due", label: "الاستحقاق" }, { key: "unpaid", label: "المبلغ", num: true, fmt: v => sar(v as number) }]} /></Section>
    </div>
    <Section print={print} title={`المصاريف في الفترة · الثابت الشهري ${sar(k.fixed_monthly)}`}><Bars rows={d.expenses.map(e => ({ label: e.name, value: e.amount }))} /></Section>
  </div>;
}
