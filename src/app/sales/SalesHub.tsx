"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ForecastClient from "../forecast/ForecastClient";

type Opt = { id: string; name: string };
type Month = { month: string; target: number; actual: number; actual_qty: number; forecast: number; allocated: boolean };
type Rep = { rep_id: string; rep_name: string; annual: number; ytd: number; month_target: number; month_actual: number; month_forecast: number; pending: number };
type Hub = { year: number; nowMonth: string; annual: number; monthly: Month[]; team: Rep[]; pending: { forecasts: number; sales: number; targets: number }; byProduct: Array<{ name: string; value: number; qty: number }>; byClinic: Array<{ name: string; city: string | null; value: number; qty: number }> };
type Tab = "overview" | "workspace";

const L = "ar-EG-u-nu-latn";
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const short = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 2 : 0)} مليون` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)} ألف` : Math.round(n).toLocaleString("en-US");
const mLabel = (m: string, o: Intl.DateTimeFormatOptions = { month: "short" }) => new Intl.DateTimeFormat(L, { ...o, timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : null;

export default function SalesHub({ isAdmin, reps, initialTab = "overview" }: { isAdmin: boolean; reps: Opt[]; initialTab?: Tab }) {
  const nowYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()).slice(0, 4));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [year, setYear] = useState(nowYear);
  const [repId, setRepId] = useState("");
  const [data, setData] = useState<Hub | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (tab !== "overview") return;
    let alive = true; setData(null); setErr("");
    const qs = new URLSearchParams({ year: String(year) }); if (isAdmin && repId) qs.set("repId", repId);
    fetch(`/api/sales/hub?${qs}`).then(r => r.ok ? r.json() : Promise.reject()).then(j => alive && setData(j)).catch(() => alive && setErr("تعذر تحميل بيانات المبيعات"));
    return () => { alive = false; };
  }, [year, repId, isAdmin, tab]);
  const pendingTotal = data ? data.pending.forecasts + data.pending.sales + data.pending.targets : 0;

  return (
    <div className="mt-4 space-y-3 pb-20 lg:pb-0">
      <div className="rounded-3xl border border-[var(--border)] bg-white p-3 flex flex-wrap items-center gap-2 shadow-sm">
        <div className="flex rounded-xl bg-[var(--bg)] p-1">
          {([["overview", "📊 الصورة الكاملة"], ["workspace", `✍️ التوقع والمبيعات والأهداف${pendingTotal ? ` (${pendingTotal})` : ""}`]] as Array<[Tab, string]>).map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 sm:px-4 py-2 text-sm font-bold ${tab === k ? "bg-white shadow text-[var(--navy)]" : "text-[var(--muted)]"}`}>{l}</button>)}
        </div>
        {tab === "overview" && <div className="flex items-center gap-2 mr-auto">
          {isAdmin && <select value={repId} onChange={e => setRepId(e.target.value)} className="h-10 rounded-xl border border-[var(--border)] px-2 text-sm"><option value="">كل الفريق</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
          <div className="flex items-center rounded-xl border border-[var(--border)]"><button onClick={() => setYear(y => y - 1)} className="h-10 w-9">›</button><span className="px-2 font-extrabold text-[var(--navy)]">{year}</span><button onClick={() => setYear(y => Math.min(nowYear + 1, y + 1))} className="h-10 w-9">‹</button></div>
        </div>}
      </div>

      {tab === "workspace" && <div className="rounded-3xl border border-[var(--border)] bg-white p-3 sm:p-5"><ForecastClient role={isAdmin ? "admin" : "sales_rep"} /></div>}

      {tab === "overview" && <>
        {err && <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-800">{err}</div>}
        {!data && !err && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-white animate-pulse" />)}</div>}
        {data && <Overview d={data} isAdmin={isAdmin} onWork={() => setTab("workspace")} onRep={setRepId} repId={repId} />}
      </>}
    </div>
  );
}

function Overview({ d, isAdmin, onWork, onRep, repId }: { d: Hub; isAdmin: boolean; onWork: () => void; onRep: (id: string) => void; repId: string }) {
  const cur = d.year === Number(d.nowMonth.slice(0, 4)) ? d.nowMonth : d.year < Number(d.nowMonth.slice(0, 4)) ? `${d.year}-12` : `${d.year}-00`;
  const past = d.monthly.filter(m => m.month <= cur);
  const ytd = past.reduce((a, m) => a + m.actual, 0);
  const targetToDate = past.reduce((a, m) => a + m.target, 0);
  const elapsed = past.length; const left = 12 - elapsed + (cur === d.nowMonth ? 1 : 0);
  const runRate = elapsed ? (ytd / elapsed) * 12 : 0;
  const need = d.annual > ytd && left > 0 ? (d.annual - ytd) / left : 0;
  const cm = d.monthly.find(m => m.month === d.nowMonth);
  const p = pct(ytd, d.annual) ?? 0, ptd = pct(targetToDate, d.annual) ?? 0;
  const pendingTotal = d.pending.forecasts + d.pending.sales + d.pending.targets;
  const best = d.byProduct[0];

  const insights: Array<[string, string, string]> = [];
  if (!d.annual) insights.push(["🎯", "لسه مفيش هدف سنوي متحدد", isAdmin ? "حدد الهدف السنوي للمناديب من تبويب التوقع والأهداف" : "الهدف السنوي بيتحدد من المدير"]);
  else {
    if (need) insights.push(["📈", `محتاج ${short(need)} ر.س شهرياً`, `عشان توصل لهدف ${short(d.annual)} في الـ ${left} شهر الباقيين`]);
    if (elapsed && ytd) insights.push([runRate >= d.annual ? "✅" : "⚠️", `بالمعدل الحالي هتقفل السنة على ${short(runRate)}`, `${pct(runRate, d.annual)}% من الهدف السنوي`]);
    if (targetToDate && ytd < targetToDate) insights.push(["⏱", `متأخر ${short(targetToDate - ytd)} ر.س عن الهدف الموزع لحد دلوقتي`, "ركّز على العيادات الأعلى قيمة والمتابعات المفتوحة"]);
  }
  if (cm && cm.target) insights.push(["🗓", `الشهر ده: ${short(cm.actual)} من ${short(cm.target)}`, cm.forecast ? `التوقع المعتمد ${short(cm.forecast)} (${pct(cm.forecast, cm.target)}% من الهدف)` : "لسه مفيش توقع معتمد للشهر"]);
  if (best) insights.push(["🏆", `أقوى منتج: ${best.name}`, `${short(best.value)} ر.س · ${best.qty} وحدة`]);

  const kpi = (l: string, v: string, s: string, c = "") => <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="text-xs text-[var(--muted)]">{l}</div><div className={`text-xl sm:text-2xl font-extrabold text-[var(--navy)] mt-1 ${c}`}>{v}</div><div className="text-[11px] text-[var(--muted)] mt-0.5">{s}</div></div>;
  return (
    <div className="space-y-3">
      {pendingTotal > 0 && <button onClick={onWork} className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center gap-2 text-right">
        <span className="text-lg">🔔</span><span className="font-bold text-amber-900">{isAdmin ? "محتاج مراجعتك:" : "مستني موافقة المدير:"}</span>
        {d.pending.forecasts > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{d.pending.forecasts} توقع</span>}
        {d.pending.sales > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{d.pending.sales} بيع</span>}
        {d.pending.targets > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{d.pending.targets} توزيع هدف</span>}
        <span className="mr-auto text-sm font-bold text-[var(--navy)]">افتح ‹</span>
      </button>}

      <div className="grid lg:grid-cols-[320px_1fr] gap-3">
        <div className="rounded-3xl bg-[var(--navy)] text-white p-5 flex flex-col items-center justify-center text-center">
          <Ring value={p} marker={ptd} />
          <div className="text-white/70 text-sm mt-3">المحقق من الهدف السنوي {d.year}</div>
          <div className="text-2xl font-extrabold mt-1">{short(ytd)} <span className="text-white/60 text-base">/ {short(d.annual)}</span></div>
          {targetToDate > 0 && <div className="text-xs text-white/70 mt-1">المفروض لحد دلوقتي {short(targetToDate)} ({ptd}%)</div>}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 content-start">
          {kpi("الهدف السنوي", short(d.annual), d.annual ? money(d.annual) : "غير محدد")}
          {kpi("المحقق", short(ytd), `${p}% من الهدف`, "text-emerald-700")}
          {kpi("الباقي", short(Math.max(0, d.annual - ytd)), need ? `${short(need)} شهرياً` : "—")}
          {kpi("نهاية السنة بالمعدل الحالي", runRate ? short(runRate) : "—", runRate && d.annual ? `${pct(runRate, d.annual)}% من الهدف` : "محتاج مبيعات معتمدة", runRate && d.annual && runRate < d.annual ? "text-amber-700" : "")}
          <div className="col-span-2 xl:col-span-4 grid sm:grid-cols-2 gap-2">
            {insights.slice(0, 4).map(([i, t, s], k) => <div key={k} className="rounded-2xl border border-[var(--border)] bg-gradient-to-l from-[var(--sky-light)] to-white p-3 flex gap-3"><span className="text-xl">{i}</span><div><div className="font-bold text-sm">{t}</div><div className="text-xs text-[var(--muted)]">{s}</div></div></div>)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="font-extrabold text-[var(--navy)]">الهدف والتوقع والمحقق — شهر بشهر</div>
          <div className="flex gap-3 text-[11px] text-[var(--muted)]"><Lg c="border-2 border-[var(--navy)]/40 bg-white" t="الهدف" /><Lg c="bg-[var(--sky-border)]" t="التوقع المعتمد" /><Lg c="bg-[var(--navy)]" t="المحقق" /><Lg c="bg-amber-500 h-0.5 w-4" t="التراكمي مقابل الهدف" /></div>
        </div>
        <Chart months={d.monthly} now={d.nowMonth} />
      </div>

      {isAdmin && !repId && d.team.length > 0 && <div className="rounded-3xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="p-4 font-extrabold text-[var(--navy)]">ترتيب المناديب</div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">المندوب</th><th className="p-3 text-right">الهدف السنوي</th><th className="p-3 text-right w-56">المحقق</th><th className="p-3 text-right">الشهر: هدف / توقع / محقق</th><th className="p-3">معلّق</th></tr></thead>
          <tbody>{[...d.team].sort((a, b) => (pct(b.ytd, b.annual) ?? -1) - (pct(a.ytd, a.annual) ?? -1)).map((r, i) => { const pp = pct(r.ytd, r.annual); return (
            <tr key={r.rep_id} onClick={() => onRep(r.rep_id)} className="border-t border-[var(--border)] cursor-pointer hover:bg-[var(--sky-light)]">
              <td className="p-3 font-bold"><span className="inline-block w-6 text-[var(--muted)]">{i + 1}</span>{r.rep_name}</td>
              <td className="p-3">{r.annual ? short(r.annual) : <span className="text-[var(--muted)]">غير محدد</span>}</td>
              <td className="p-3"><div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full ${(pp ?? 0) >= ptd ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, pp ?? 0)}%` }} /></div><span className="text-xs font-bold w-24 whitespace-nowrap">{short(r.ytd)}{pp !== null ? ` · ${pp}%` : ""}</span></div></td>
              <td className="p-3 text-xs">{r.month_target ? short(r.month_target) : "—"} / {r.month_forecast ? short(r.month_forecast) : "—"} / <b>{short(r.month_actual)}</b></td>
              <td className="p-3 text-center">{r.pending ? <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">{r.pending}</span> : "—"}</td>
            </tr>); })}</tbody>
        </table></div>
      </div>}

      <div className="grid lg:grid-cols-2 gap-3">
        <Breakdown title="المبيعات حسب المنتج" rows={d.byProduct.map(x => ({ k: x.name, v: x.value, s: `${x.qty} وحدة` }))} />
        <Breakdown title="أعلى العيادات" rows={d.byClinic.map(x => ({ k: x.name, v: x.value, s: [x.city, `${x.qty} وحدة`].filter(Boolean).join(" · ") }))} />
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="p-4 font-extrabold text-[var(--navy)]">تفاصيل الشهور</div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">الشهر</th><th className="p-3 text-right">الهدف</th><th className="p-3 text-right">التوقع المعتمد</th><th className="p-3 text-right">المحقق</th><th className="p-3 text-right">الفرق</th><th className="p-3 text-right">الحالة</th></tr></thead>
          <tbody>{d.monthly.map(m => { const diff = m.actual - m.target; const isPast = m.month < d.nowMonth, isNow = m.month === d.nowMonth; return (
            <tr key={m.month} className={`border-t border-[var(--border)] ${isNow ? "bg-[var(--sky-light)]" : ""}`}>
              <td className="p-3 font-bold">{mLabel(m.month, { month: "long" })}{isNow && <span className="mr-1 text-[10px] text-[var(--navy)]">● الحالي</span>}</td>
              <td className="p-3">{m.allocated ? money(m.target) : <span className="text-[var(--muted)]">غير موزع</span>}</td>
              <td className="p-3">{m.forecast ? money(m.forecast) : "—"}</td>
              <td className="p-3 font-bold">{m.actual ? money(m.actual) : "—"}</td>
              <td className={`p-3 font-bold ${!m.allocated || (!isPast && !isNow) ? "text-[var(--muted)]" : diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>{m.allocated && (isPast || isNow) ? `${diff >= 0 ? "+" : ""}${short(diff)}` : "—"}</td>
              <td className="p-3">{!m.allocated ? <Pill t="غير موزع" c="bg-slate-100 text-slate-600" /> : isNow ? <Pill t={`${pct(m.actual, m.target) ?? 0}% لحد دلوقتي`} c="bg-sky-50 text-sky-800" /> : !isPast ? <Pill t="قادم" c="bg-slate-50 text-slate-600" /> : <Pill t={diff >= 0 ? "حقق الهدف" : "أقل من الهدف"} c={diff >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"} />}</td>
            </tr>); })}</tbody>
        </table></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onWork} className="rounded-xl bg-[var(--navy)] text-white px-4 py-2.5 text-sm font-bold">✍️ {isAdmin ? "مراجعة التوقعات والمبيعات والأهداف" : "سجّل توقعك أو بيع جديد"}</button>
        <Link href="/doctors" className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold">الأطباء المحتاجين زيارة</Link>
        <Link href="/calendar" className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold">مخطط العمل</Link>
      </div>
    </div>
  );
}

const Pill = ({ t, c }: { t: string; c: string }) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c}`}>{t}</span>;
const Lg = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${c}`} />{t}</span>;

function Ring({ value, marker }: { value: number; marker: number }) {
  const r = 62, C = 2 * Math.PI * r, v = Math.min(100, Math.max(0, value)), m = Math.min(100, Math.max(0, marker));
  const ang = (m / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg viewBox="0 0 160 160" className="w-44 h-44" aria-label={`${value}%`}>
      <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="14" />
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--sky)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 80 80)" style={{ transition: "stroke-dasharray .8s ease" }} />
      {m > 0 && <circle cx={80 + r * Math.cos(ang)} cy={80 + r * Math.sin(ang)} r="5" fill="#f59e0b" stroke="white" strokeWidth="2" />}
      <text x="80" y="88" textAnchor="middle" fill="white" fontSize="30" fontWeight="800">{value}%</text>
    </svg>
  );
}

function Chart({ months, now }: { months: Month[]; now: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map(m => Math.max(m.target, m.actual, m.forecast)));
  const cumT = useMemo(() => { let a = 0; return months.map(m => (a += m.target)); }, [months]);
  const cumA = useMemo(() => { let a = 0; return months.map(m => (a += m.actual)); }, [months]);
  const cmax = Math.max(1, cumT[11], cumA[11]);
  const W = 1200, H = 260, pad = 30, bw = (W - pad * 2) / 12;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const yc = (v: number) => H - pad - (v / cmax) * (H - pad * 2);
  const lastIdx = months.findIndex(m => m.month > now);
  const actualPts = cumA.slice(0, lastIdx === -1 ? 12 : lastIdx).map((v, i) => `${pad + bw * i + bw / 2},${yc(v)}`).join(" ");
  const h = hover !== null ? months[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56 sm:h-64" style={{ direction: "ltr" }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="4 6" />)}
        {months.map((m, i) => { const x = pad + bw * i; const inner = bw * 0.62; const bx = x + (bw - inner) / 2; return (
          <g key={m.month} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <rect x={x} y={pad / 2} width={bw} height={H - pad} fill={hover === i ? "rgba(16,72,79,.05)" : "transparent"} />
            {m.target > 0 && <rect x={bx} y={y(m.target)} width={inner} height={H - pad - y(m.target)} rx="6" fill="white" stroke="rgba(16,72,79,.35)" strokeWidth="2" strokeDasharray="5 4" />}
            {m.forecast > 0 && <rect x={bx + inner * 0.12} y={y(m.forecast)} width={inner * 0.76} height={H - pad - y(m.forecast)} rx="5" fill="var(--sky-border)" />}
            {m.actual !== 0 && <rect x={bx + inner * 0.27} y={y(Math.max(0, m.actual))} width={inner * 0.46} height={Math.max(2, H - pad - y(Math.max(0, m.actual)))} rx="4" fill={m.month === now ? "var(--sky)" : "var(--navy)"} />}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="13" fill={m.month === now ? "var(--navy)" : "var(--muted)"} fontWeight={m.month === now ? 800 : 400}>{mLabel(m.month)}</text>
          </g>); })}
        <polyline points={cumT.map((v, i) => `${pad + bw * i + bw / 2},${yc(v)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" opacity=".7" />
        {actualPts ? <polyline points={actualPts} fill="none" stroke="#f59e0b" strokeWidth="3" /> : null}
      </svg>
      {h && <div className="absolute top-2 right-2 rounded-xl bg-white/95 border border-[var(--border)] shadow p-3 text-xs space-y-0.5 pointer-events-none">
        <div className="font-extrabold text-[var(--navy)]">{mLabel(h.month, { month: "long", year: "numeric" })}</div>
        <div>الهدف: <b>{h.allocated ? money(h.target) : "غير موزع"}</b></div><div>التوقع: <b>{h.forecast ? money(h.forecast) : "—"}</b></div><div>المحقق: <b>{money(h.actual)}</b>{h.actual_qty ? ` · ${h.actual_qty} وحدة` : ""}</div>
      </div>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ k: string; v: number; s: string }> }) {
  const max = Math.max(1, ...rows.map(r => r.v));
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4">
      <div className="font-extrabold text-[var(--navy)] mb-3">{title}</div>
      {!rows.length ? <div className="text-sm text-[var(--muted)] text-center py-8">لسه مفيش مبيعات معتمدة في السنة دي</div> :
        <div className="space-y-2.5">{rows.map(r => <div key={r.k}><div className="flex justify-between text-sm mb-1"><span className="font-bold truncate">{r.k}</span><span className="text-xs text-[var(--muted)] whitespace-nowrap">{short(r.v)} ر.س · {r.s}</span></div><div className="h-2 rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${(Math.max(0, r.v) / max) * 100}%` }} /></div></div>)}</div>}
    </div>
  );
}
