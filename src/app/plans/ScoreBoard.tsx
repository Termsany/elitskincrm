"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { PART_AR, PARTS, type Part, type Weights } from "@/lib/rep-score-core";
import type { RepScores } from "@/lib/rep-score";
import { AiAdvisor } from "../daftra-sales/ai";
import WeekBoard from "./WeekBoard";
import AreaBoard from "./AreaBoard";

type Row = RepScores["rows"][number];
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const shiftM = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const mName = (m: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const tone = (s: number | null) => s === null ? "text-slate-400" : s >= 80 ? "text-emerald-600" : s >= 60 ? "text-amber-600" : "text-red-600";
const bg = (v: number | null) => v === null ? "bg-slate-200" : v >= 0.8 ? "bg-teal-500" : v >= 0.6 ? "bg-amber-400" : "bg-red-400";
const initials = (n: string) => n.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase();
const CHIPS = ["مين أحسن مندوب الشهر ده وليه؟", "مين محتاج متابعة ومحتاج يعمل إيه بالظبط؟", "إيه أكتر حاجة بتنزّل تقييم الفريق؟", "اقترح خطة الأسبوع الجاي لكل مندوب"];

/** What each part is made of, in numbers. */
function detail(k: Part, r: Row["raw"]) {
  switch (k) {
    case "plan": return r.planned ? `${r.planDone} من ${r.planned} زيارة في الخطة اتعملت` : "مفيش خطة الشهر ده";
    case "coverage": return r.required ? `${r.covered} من ${Math.round(r.required)} زيارة مطلوبة${r.aRequired ? ` · A ${r.aCovered}/${Math.round(r.aRequired)}` : ""}` : "مفيش أطباء في المنطقة";
    case "sales": return r.expected ? `${money(r.mtd)} من ${money(r.expected)} المفروض لحد النهارده` : "مفيش تارجت الشهر ده";
    case "quality": return r.completed ? `${r.productive} من ${r.completed} زيارة ليها نتيجة` : "مفيش زيارات";
    case "discipline": return `${r.cancelled} إلغاء من ${r.total} · ${r.idleDays} يوم من غير شغل من ${r.workDays}`;
  }
}
const TIP: Record<Part, string> = { plan: "نفّذ زيارات الخطة في أسبوعها", coverage: "زور المتأخرين في «منطقتي» — A الأول", sales: "ركّز على العيادات اللي جه ميعاد طلبها", quality: "سجّل نتيجة كل زيارة: عرض، عينة، طلب أو متابعة", discipline: "قلل الإلغاء وسجّل الوقت المكتبي" };

function Parts({ r }: { r: Row }) {
  return <div className="space-y-2.5">{PARTS.map(k => { const v = r.parts[k]; return <div key={k}>
    <div className="flex items-center justify-between text-xs"><b className="text-[var(--navy)]">{PART_AR[k]}</b><span className={`font-extrabold ${tone(v === null ? null : v * 100)}`}>{v === null ? "—" : `${Math.round(v * 100)}%`}</span></div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full transition-all duration-700 ${bg(v)}`} style={{ width: `${v === null ? 0 : v * 100}%` }} /></div>
    <div className="mt-0.5 text-[11px] text-[var(--muted)]">{detail(k, r.raw)}</div></div>; })}</div>;
}
function Trend({ r }: { r: Row }) {
  if (r.score === null || r.prev === null) return null;
  const d = r.score - r.prev; if (!d) return <span className="text-[11px] text-[var(--muted)]">= الشهر اللي فات</span>;
  return <span className={`text-[11px] font-bold ${d > 0 ? "text-emerald-600" : "text-red-600"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} عن الشهر اللي فات</span>;
}

/** Monthly rep score: the admin ranks the team and opens any rep; a rep sees their own score and what would lift it most. */
export default function ScoreBoard({ isAdmin, ai, aiSetup }: { isAdmin: boolean; ai: boolean; aiSetup: boolean }) {
  const toast = useToast();
  const [month, setMonth] = useState(""); const [s, setS] = useState<RepScores | null>(null);
  const [open, setOpen] = useState(""); const [drawer, setDrawer] = useState<{ id: string; name: string; kind: "week" | "area" } | null>(null);
  const [w, setW] = useState<Weights | null>(null); const [showW, setShowW] = useState(false); const [aiOn, setAiOn] = useState(ai);
  const load = useCallback(() => {
    fetch(`/api/plans/score${month ? `?month=${month}` : ""}`).then(r => r.ok ? r.json() : null).then((j: RepScores | null) => { if (!j) { toast("تعذر تحميل التقييم", "error"); return; } setS(j); setW(j.weights); }).catch(() => toast("تعذر تحميل التقييم", "error"));
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!drawer) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [drawer]);

  async function saveW() {
    const r = await fetch("/api/plans/score", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(w) });
    const j = await r.json().catch(() => null); if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظت الأوزان ✓", "success"); setShowW(false); load();
  }

  if (!s) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-28 rounded-[26px]" />)}</div>;
  const nowM = new Date().toISOString().slice(0, 7);
  const nav = <div className="flex flex-wrap items-center gap-2">
    <h2 className="text-xl font-extrabold text-[var(--navy)]">{isAdmin ? "تقييم المناديب" : "تقييمي"}</h2>
    <div className="mr-auto flex items-center rounded-2xl border border-[var(--border)] bg-white">
      <button type="button" aria-label="الشهر اللي فات" onClick={() => setMonth(shiftM(s.month, -1))} className="grid h-10 w-10 place-items-center">›</button>
      <span className="px-2 text-sm font-bold">{mName(s.month)}</span>
      <button type="button" aria-label="الشهر الجاي" disabled={s.month >= nowM} onClick={() => setMonth(shiftM(s.month, 1))} className="grid h-10 w-10 place-items-center disabled:opacity-30">‹</button></div>
    {isAdmin && <button type="button" onClick={() => setShowW(x => !x)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold">⚖ الأوزان</button>}
  </div>;

  if (!isAdmin) {
    const r = s.rows[0];
    if (!r) return <div className="space-y-4">{nav}<p className="rounded-[26px] bg-white p-8 text-center text-sm text-[var(--muted)]">مفيش بيانات للشهر ده</p></div>;
    return <div className="space-y-4">{nav}
      <section className="grid gap-4 rounded-[26px] border border-[var(--border)] bg-white p-5 shadow-sm md:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center justify-center gap-1 text-center"><div className={`text-6xl font-black ${tone(r.score)}`}>{r.score ?? "—"}</div><div className="text-xs text-[var(--muted)]">من 100</div><Trend r={r} />
          {r.lift && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">⬆ {PART_AR[r.lift]} ممكن تزوّدك {r.liftPts} درجة: {TIP[r.lift]}</div>}</div>
        <Parts r={r} />
      </section>
    </div>;
  }

  const sum = w ? PARTS.reduce((a, k) => a + (w[k] || 0), 0) : 0;
  return <div className="space-y-4">{nav}
    {showW && w && <section className="es-pop rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{PARTS.map(k => <label key={k} className="text-xs font-bold text-[var(--navy)]">{PART_AR[k]}
        <input type="number" min={0} max={100} value={w[k]} onChange={e => setW({ ...w, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="mt-1 h-10 w-full rounded-xl border border-[var(--border)] px-3 text-sm" /></label>)}</div>
      <div className="mt-3 flex items-center gap-2"><span className={`text-xs font-bold ${sum === 100 ? "text-emerald-700" : "text-amber-700"}`}>المجموع {sum}</span>
        <button type="button" onClick={() => void saveW()} disabled={!sum} className="mr-auto h-10 rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white disabled:opacity-40">حفظ</button></div>
    </section>}

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.9fr)]">
      <section className="rounded-[26px] border border-[var(--border)] bg-white shadow-sm">
        <ul className="divide-y divide-[var(--border)]">{s.rows.map((r, i) => <li key={r.rep_id}>
          <button type="button" onClick={() => setOpen(open === r.rep_id ? "" : r.rep_id)} className="flex w-full items-center gap-3 px-4 py-3 text-right transition hover:bg-[var(--bg)]">
            <span className="w-5 text-center text-sm font-extrabold text-[var(--muted)]">{i + 1}</span>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sky-soft)] text-xs font-extrabold text-[var(--navy)]">{initials(r.name)}</span>
            <div className="min-w-0 flex-1"><b className="block truncate" dir="auto">{r.name}</b>
              <div className="mt-1.5 flex gap-1" aria-hidden>{PARTS.map(k => <span key={k} title={`${PART_AR[k]}: ${r.parts[k] === null ? "—" : Math.round(r.parts[k]! * 100) + "%"}`} className={`h-1.5 flex-1 rounded-full ${bg(r.parts[k])}`} />)}</div>
              <div className="mt-1"><Trend r={r} />{r.lift && <span className="mr-2 text-[11px] text-[var(--muted)]">· أضعف بند: {PART_AR[r.lift]}</span>}</div></div>
            <span className={`text-3xl font-black ${tone(r.score)}`}>{r.score ?? "—"}</span>
          </button>
          {open === r.rep_id && <div className="es-pop space-y-3 bg-[var(--bg)]/50 px-4 pb-4 pt-2">
            <Parts r={r} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDrawer({ id: r.rep_id, name: r.name, kind: "week" })} className="min-h-9 rounded-xl bg-[var(--navy)] px-3 text-xs font-bold text-white">أسبوعه</button>
              <button type="button" onClick={() => setDrawer({ id: r.rep_id, name: r.name, kind: "area" })} className="min-h-9 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-bold">منطقته</button>
            </div>
          </div>}
        </li>)}</ul>
        {!s.rows.length && <p className="p-8 text-center text-sm text-[var(--muted)]">مفيش مناديب</p>}
      </section>
      <div className="space-y-4">
        {aiOn ? <AiAdvisor d={{ ai }} reload={() => location.reload()} chips={CHIPS} ask={null} endpoint="/api/plans/ai" placeholder="اسأل عن المناديب، التغطية، الخطط…" canSetup={aiSetup} />
          : aiSetup && <button type="button" onClick={() => setAiOn(true)} className="w-full rounded-[26px] border border-dashed border-[var(--border-strong)] bg-white p-4 text-sm font-bold text-[var(--navy)]">✨ اربط المستشار الذكي</button>}
      </div>
    </div>

    {drawer && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[60] bg-[var(--navy)]/25 backdrop-blur-[2px]" onClick={() => setDrawer(null)}>
        <section dir="rtl" role="dialog" aria-modal="true" aria-label={drawer.name} onClick={e => e.stopPropagation()} className="absolute inset-y-0 right-0 w-[min(760px,100vw)] overflow-y-auto bg-[var(--bg)] p-4 shadow-2xl sm:p-5">
          <div className="mb-3 flex items-center gap-2"><h2 className="text-lg font-extrabold text-[var(--navy)]" dir="auto">{drawer.kind === "week" ? "أسبوع" : "منطقة"} {drawer.name}</h2><button type="button" onClick={() => setDrawer(null)} aria-label="إغلاق" className="mr-auto grid h-9 w-9 place-items-center rounded-full bg-white">✕</button></div>
          {drawer.kind === "week" ? <WeekBoard repId={drawer.id} isAdmin embedded /> : <AreaBoard repId={drawer.id} isAdmin />}
        </section>
      </div>, document.body)}
  </div>;
}
