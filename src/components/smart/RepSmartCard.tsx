"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { BrokenPromise, Pace, ReorderDue } from "@/lib/smart";

type R = ReorderDue & { my_last_visit: string | null; visited_since_order: boolean };
type D = { today: string; reorder: R[]; hiddenCount: number; pace: Pace | null; promises: BrokenPromise[]; nextWeek: { start: string; plan: { id: string; status: string } | null } };
const k = (n: number) => Math.round(n).toLocaleString("en-US");
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const ago = (today: string, d: string) => { const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5); return n <= 0 ? "النهارده" : n === 1 ? "امبارح" : `من ${n} يوم`; };
const when = (n: number) => n < 0 ? `متأخر ${-n} يوم` : n === 0 ? "النهارده" : n === 1 ? "بكرة" : `بعد ${n} يوم`;
const COLLAPSE = "es-smart-collapsed";
const pretty = (s: string) => s.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Rep home: what deserves attention today — clinics due to reorder (visit, snooze, or "not mine"), broken payment promises, pace to target, next week's plan. */
export default function RepSmartCard() {
  const toast = useToast();
  const [d, setD] = useState<D | null>(null); const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null); const [docsFor, setDocsFor] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]); const [undo, setUndo] = useState<{ kind: string; ref: string; label: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const load = () => fetch("/api/smart", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setD(j)).catch(() => null);
  useEffect(() => { void load(); try { setCollapsed(localStorage.getItem(COLLAPSE) === new Date().toDateString()); } catch { /* private mode */ } }, []);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 6000); return () => clearTimeout(t); }, [undo]);
  if (!d) return null;

  const p = d.pace, wd = new Date(`${d.today}T12:00:00Z`).getUTCDay();
  const showPlan = !d.nextWeek.plan && wd >= 3 && wd <= 6;
  const reorder = d.reorder.filter(r => !gone.includes(`reorder:${r.clinic_id}`)), promises = d.promises.filter(x => !gone.includes(`promise:${x.client_id}`));
  const urgent = reorder.filter(r => !r.visited_since_order).length + promises.length;
  if (!reorder.length && !promises.length && !(p && p.target) && !showPlan && d.nextWeek.plan?.status !== "draft" && !undo) return null;

  function toggleCollapse() { const v = !collapsed; setCollapsed(v); try { if (v) localStorage.setItem(COLLAPSE, new Date().toDateString()); else localStorage.removeItem(COLLAPSE); } catch { /* ignore */ } }
  async function dismiss(kind: string, ref: string, days: number, reason: string, label: string) {
    setMenu(null); setGone(g => [...g, `${kind}:${ref}`]);
    const r = await fetch("/api/smart/dismiss", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ref, days, reason }) });
    if (!r.ok) { setGone(g => g.filter(x => x !== `${kind}:${ref}`)); toast("تعذر الحفظ", "error"); return; }
    setUndo({ kind, ref, label });
  }
  async function restore() {
    if (!undo) return; const u = undo; setUndo(null);
    await fetch("/api/smart/dismiss", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: u.kind, ref: u.ref }) });
    setGone(g => g.filter(x => x !== `${u.kind}:${u.ref}`));
  }
  async function draft() {
    setBusy(true); const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy(false);
    const c = j?.created?.[0];
    if (c) { toast(`اتجهزت مسودة ${c.visits} زيارة ✓`, "success"); location.href = `/plans?planId=${c.plan_id}`; }
    else toast(j?.skipped?.[0]?.why || j?.error || "تعذر تجهيز الخطة", "error");
  }
  const pct = p?.pct ?? null, tone = pct === null ? "#3b90e8" : pct >= 100 ? "#1aa865" : pct >= 85 ? "#e99608" : "#ef4b4e";

  const menuBtn = (id: string) => <button type="button" onClick={() => { setMenu(menu === id ? null : id); setDocsFor(null); }} aria-label="خيارات" aria-expanded={menu === id}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition ${menu === id ? "bg-[var(--navy)] text-white" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>⋯</button>;
  const actions = (id: string, items: Array<[string, () => void]>) => menu === id && <div className="es-pop mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
    {items.map(([l, f]) => <button key={l} type="button" onClick={f} className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[var(--navy)] transition hover:border-[var(--navy)]">{l}</button>)}</div>;

  return <section className="es-card-in mb-4 rounded-3xl border border-[var(--border)] bg-white shadow-sm" aria-label="اقتراحات النهارده">
    <button type="button" onClick={toggleCollapse} aria-expanded={!collapsed} className="flex w-full items-center gap-2 p-4 text-right">
      <span className="text-xl">💡</span><h2 className="font-extrabold text-[var(--navy)]">اقتراحات النهارده</h2>
      {urgent > 0 && <span className="rounded-full bg-[var(--navy)] px-2 py-0.5 text-[11px] font-bold text-white">{urgent}</span>}
      <span className="mr-auto text-[11px] font-bold text-[var(--muted)]">{collapsed ? "اعرض ▾" : "صغّر ▴"}</span>
    </button>

    {!collapsed && <div className="space-y-3 px-4 pb-4">
      {undo && <div className="es-pop flex items-center justify-between gap-2 rounded-xl bg-[var(--navy)] px-3 py-2 text-[12px] text-white"><span>اتخفت «{undo.label}»</span><button type="button" onClick={() => void restore()} className="rounded-lg bg-white/15 px-2.5 py-1 font-bold">تراجع</button></div>}

      {p && p.target > 0 && <div className="rounded-2xl bg-[var(--bg)] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><b className="text-[var(--navy)]">هدفك الشهر ده</b><span className="text-[12px] text-[var(--muted)]">حققت {k(p.mtd)} من {k(p.target)} ر.س</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, p.mtd / p.target * 100)}%`, background: tone }} /></div>
        <div className="mt-1.5 text-[12px] font-bold" style={{ color: tone }}>{pct === null ? "" : pct >= 100 ? `على السرعة دي هتعدّي الهدف — متوقع ${k(p.projected)} ر.س (${pct}%) 🎉` : `على السرعة دي هتقفل على ${k(p.projected)} ر.س (${pct}%)${reorder.length ? " — العيادات اللي تحت أسرع طريق" : ""}`}</div>
      </div>}

      {reorder.length > 0 && <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-[var(--muted)]"><span>عيادات قرّب ميعاد طلبها</span><span className="font-normal">من عادتها في الطلب</span></div>
        <ul className="space-y-1.5">{reorder.slice(0, 5).map(r => { const id = `r-${r.clinic_id}`, docs = r.doctors, name = r.branches?.length === 1 ? r.branches[0] : r.clinic_name;
          return <li key={r.clinic_id} className={`es-card-in rounded-2xl border p-2.5 transition ${r.visited_since_order ? "border-emerald-200 bg-emerald-50/40" : "border-[var(--border)]"}`}>
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold ${r.visited_since_order ? "bg-emerald-100 text-emerald-800" : r.days_to < 0 ? "bg-red-50 text-red-700" : r.days_to <= 2 ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}>{r.visited_since_order ? "✓ زرتها" : when(r.days_to)}</span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm" dir="auto">{name}</b>
                <span className="block truncate text-[11px] text-[var(--muted)]">{r.visited_since_order && r.my_last_visit ? `زرتها ${ago(d.today, r.my_last_visit)} — مستنيين الطلب · ` : ""}بتطلب كل {r.usual_gap} يوم · آخر طلب {dm(r.last)}{r.top[0] ? ` · ${pretty(r.top[0])}` : ""}</span>
              </div>
              {docs.length === 1 ? <Link href={`/visits/new?doctorId=${docs[0].id}`} className="shrink-0 rounded-xl bg-[var(--navy)] px-3 py-2 text-[11.5px] font-bold text-white transition hover:-translate-y-0.5">زيارة ‹</Link>
                : docs.length > 1 ? <button type="button" onClick={() => { setDocsFor(docsFor === id ? null : id); setMenu(null); }} aria-expanded={docsFor === id} className="shrink-0 rounded-xl bg-[var(--navy)] px-3 py-2 text-[11.5px] font-bold text-white">زيارة {docsFor === id ? "▴" : "▾"}</button>
                : <span className="shrink-0 rounded-xl bg-[var(--bg)] px-2.5 py-2 text-[10.5px] text-[var(--muted)]" title="العميل ده مش مربوط بفرع فيه أطباء">مفيش أطباء</span>}
              {menuBtn(id)}
            </div>
            {docsFor === id && <div className="es-pop mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">{docs.map(x => <Link key={x.id} href={`/visits/new?doctorId=${x.id}`} className="rounded-full bg-[var(--sky-light)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--navy)] hover:bg-[var(--navy)] hover:text-white" dir="auto">{x.name}{x.classification ? ` · ${x.classification}` : ""}</Link>)}</div>}
            {actions(id, [
              ["✓ زرتها / اتكلمت معاهم", () => void dismiss("reorder", r.clinic_id, Math.max(7, Math.round(r.usual_gap / 2)), "visited", name)],
              ["⏰ فكّرني بعد 3 أيام", () => void dismiss("reorder", r.clinic_id, 3, "later", name)],
              ["🚫 مش متابعها", () => void dismiss("reorder", r.clinic_id, 60, "not_mine", name)],
            ])}
          </li>; })}</ul>
        {reorder.length > 5 && <div className="mt-1 text-center text-[11px] text-[var(--muted)]">+ {reorder.length - 5} كمان بعد ما تخلص دول</div>}
      </div>}

      {promises.length > 0 && <div>
        <div className="mb-1.5 text-xs font-bold text-[var(--muted)]">وعود سداد عدّى ميعادها</div>
        <ul className="space-y-1.5">{promises.slice(0, 3).map(x => { const id = `p-${x.client_id}`, name = x.clinic_name || x.customer;
          return <li key={x.client_id} className="rounded-2xl border border-red-100 bg-red-50/50 p-2.5"><div className="flex items-center gap-2">
            <span className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-[11px] font-extrabold text-red-700">متأخر {x.days_late} يوم</span>
            <div className="min-w-0 flex-1"><b className="block truncate text-sm" dir="auto">{name}</b><span className="block truncate text-[11px] text-[var(--muted)]">وعد يدفع {dm(x.promise_date)}{x.amount ? ` ${k(x.amount)} ر.س` : ""} · عليها {k(x.unpaid)} ر.س</span></div>
            <Link href="/#collections" className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11.5px] font-bold text-red-700">سجّل الرد</Link>
            {menuBtn(id)}</div>
            {actions(id, [["✓ اتكلمت معاهم — إخفاء أسبوع", () => void dismiss("promise", String(x.client_id), 7, "visited", name)], ["⏰ فكّرني بعد 3 أيام", () => void dismiss("promise", String(x.client_id), 3, "later", name)]])}
          </li>; })}</ul>
      </div>}

      {showPlan && <button type="button" disabled={busy} onClick={() => void draft()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--navy)] px-4 py-3 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60">
        <Icon name="calendar" size={18} />{busy ? "بجهّز…" : "جهّز لي خطة الأسبوع الجاي"}</button>}
      {d.nextWeek.plan?.status === "draft" && <Link href={`/plans?planId=${d.nextWeek.plan.id}`} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--navy)]/30 px-4 py-3 text-sm font-bold text-[var(--navy)]">🗓️ مسودة خطة الأسبوع الجاي جاهزة — راجعها وابعتها ‹</Link>}
      {d.hiddenCount > 0 && <div className="text-center text-[10.5px] text-[var(--muted)]">{d.hiddenCount} اقتراح مخفي — هيرجعوا لوحدهم في ميعادهم</div>}
    </div>}
  </section>;
}
