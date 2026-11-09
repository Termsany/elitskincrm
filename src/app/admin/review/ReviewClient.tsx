"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import Sheet, { Field, FailBox, fieldCls, btnPrimary, btnSoft, btnGhost } from "@/components/Sheet";
import { UndoProvider, useUndo } from "@/components/UndoToast";
import { FixPopup } from "../Priorities";

type Issue = "gps" | "notes" | "far" | "burst";
type Row = { id: string; doctor_id: string; doctor: string; clinic: string; city: string; rep_id: string; rep: string; day: string; hm: string; notes: string; products: string[]; attachments: number; issues: Issue[]; status: "review" | "fix" | "ok"; reason: string; distance_m: number | null };
type Rules = { min_notes: number; far_m: number; days: number };
const ISSUE: Record<Issue, string> = { gps: "من غير موقع", notes: "ملاحظات قصيرة", far: "بعيدة عن العيادة", burst: "من نفس المكان مع زيارات تانية" };
const STATUS: Array<[string, string]> = [["review", "تحتاج مراجعة"], ["fix", "مستنية تصحيح"], ["ok", "اتعتمدت"], ["all", "الكل"]];
const ST: Record<Row["status"], [string, string]> = { review: ["تحتاج مراجعة", "bg-amber-50 text-amber-800"], fix: ["مستنية تصحيح", "bg-sky-50 text-sky-800"], ok: ["اتعتمدت", "bg-emerald-50 text-emerald-800"] };
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const Q_KEY = "review:q", Y_KEY = "review:y";

export default function ReviewClient({ canEditRules }: { canEditRules: boolean }) { return <UndoProvider><Review canEditRules={canEditRules} /></UndoProvider>; }

/* Filters live in the URL; the query and scroll position are also kept in sessionStorage, so coming back to
   /admin/review (from the home page or a visit) restores the same filtered list at the same spot. */
function Review({ canEditRules }: { canEditRules: boolean }) {
  const sp = useSearchParams(), router = useRouter(), path = usePathname(), undo = useUndo();
  const status = sp.get("status") || "review", issue = (sp.get("issue") || "") as Issue | "", rep = sp.get("rep") || "", days = sp.get("days") || "";
  const [data, setData] = useState<{ rules: Rules; counts: Record<string, number>; rows: Row[] } | null>(null); const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string[]>([]); const [open, setOpen] = useState<string | null>(null);
  const openParam = sp.get("open"); useEffect(() => { if (openParam) setOpen(openParam); }, [openParam]); const [fixIds, setFixIds] = useState<string[] | null>(null); const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!sp.toString()) { try { const q = sessionStorage.getItem(Q_KEY); if (q) router.replace(`${path}?${q}`); } catch { /* ignore */ } } }, [sp, router, path]);
  const load = useCallback(() => fetch(`/api/admin/review?status=all${days ? `&days=${days}` : ""}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => { setData(j); setErr(false); }).catch(() => setErr(true)), [days]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { const q = new URLSearchParams(sp.toString()); q.delete("open"); sessionStorage.setItem(Q_KEY, q.toString()); } catch { /* ignore */ } }, [sp]);
  useEffect(() => { if (!data) return; try { const y = Number(sessionStorage.getItem(Y_KEY) || 0); if (y) requestAnimationFrame(() => window.scrollTo(0, y)); } catch { /* ignore */ }
    const save = () => { try { sessionStorage.setItem(Y_KEY, String(window.scrollY)); } catch { /* ignore */ } }; window.addEventListener("scroll", save, { passive: true }); return () => window.removeEventListener("scroll", save); }, [data]);
  const set = (key: string, v: string) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(key, v); else q.delete(key); q.delete("open"); setSel([]); router.replace(`${path}?${q}`, { scroll: false }); };

  const all = useMemo(() => data?.rows || [], [data]);
  const counts = useMemo(() => ({ review: all.filter(r => r.status === "review").length, fix: all.filter(r => r.status === "fix").length, ok: all.filter(r => r.status === "ok").length, all: all.length }), [all]);
  const list = useMemo(() => all.filter(r => (status === "all" || r.status === status) && (!issue || r.issues.includes(issue)) && (!rep || r.rep_id === rep)), [all, status, issue, rep]);
  const reps = useMemo(() => [...new Map(all.map(r => [r.rep_id, r.rep])).entries()], [all]);
  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const mark = (ids: string[], st: Row["status"]) => setData(d => d && { ...d, rows: d.rows.map(r => ids.includes(r.id) ? { ...r, status: st } : r) });

  const approve = async (ids: string[]) => {
    if (busy || !ids.length) return; setBusy(true);
    const r = await fetch("/api/admin/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, action: "approve" }) }).catch(() => null); setBusy(false);
    if (!r?.ok) { undo({ text: "تعذر الاعتماد، حاول تاني", err: true }); return; }
    const before = all.filter(x => ids.includes(x.id)).map(x => [x.id, x.status] as const);
    mark(ids, "ok"); setSel([]); setOpen(o => o && ids.includes(o) ? null : o);
    undo({ text: ids.length === 1 ? "اتعتمدت الزيارة" : `اتعتمدت ${ids.length} زيارات`, undo: async () => {
      await fetch("/api/admin/review", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null);
      setData(d => d && { ...d, rows: d.rows.map(x => { const b = before.find(y => y[0] === x.id); return b ? { ...x, status: b[1] } : x; }) }); } });
  };
  const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full border px-4 text-[13.5px] font-bold transition-colors duration-150 ${on ? "border-[var(--sky)] bg-[var(--sky-soft)] text-[var(--navy)]" : "border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--ink)]"}`;
  const openRow = list.find(r => r.id === open) || all.find(r => r.id === open) || null;

  return <div className="space-y-4 pb-28">
    <Link href="/admin" className="inline-flex min-h-10 items-center gap-1 text-[13.5px] font-bold text-[var(--muted)] hover:text-[var(--ink)]">› رجوع للرئيسية</Link>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-[26px] font-extrabold text-[var(--navy)]">مراجعة الزيارات</h1>
        {data && <p className="text-[13px] text-[var(--muted)]">آخر {days || data.rules.days} يوم، الملاحظات أقل من {data.rules.min_notes} حرف أو بُعد أكتر من {data.rules.far_m} م أو من غير موقع</p>}</div>
      {canEditRules && <button type="button" className={btnGhost} onClick={() => setRulesOpen(true)}>⚙ قواعد المراجعة</button>}
    </div>

    <div role="tablist" aria-label="الحالة" className="flex gap-2 overflow-x-auto pb-1">{STATUS.map(([v, l]) => <button key={v} role="tab" aria-selected={status === v} className={chip(status === v)} onClick={() => set("status", v === "review" ? "" : v)}>{l} <span className="opacity-70">{counts[v as keyof typeof counts]}</span></button>)}</div>
    <div className="flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="الفلاتر">
      {(Object.keys(ISSUE) as Issue[]).map(i => <button key={i} className={chip(issue === i)} aria-pressed={issue === i} onClick={() => set("issue", issue === i ? "" : i)}>{ISSUE[i]}</button>)}
      <select value={rep} onChange={e => set("rep", e.target.value)} aria-label="المندوب" className="min-h-10 shrink-0 rounded-full border border-[var(--border)] bg-white px-4 text-[13.5px] font-bold"><option value="">كل المناديب</option>{reps.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select value={days} onChange={e => set("days", e.target.value)} aria-label="الفترة" className="min-h-10 shrink-0 rounded-full border border-[var(--border)] bg-white px-4 text-[13.5px] font-bold"><option value="">الفترة الافتراضية</option><option value="7">آخر 7 أيام</option><option value="30">آخر 30 يوم</option><option value="60">آخر 60 يوم</option></select>
    </div>

    <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white">
      {!data ? (err ? <p className="p-8 text-center">تعذر التحميل <button onClick={() => void load()} className="mr-2 rounded-xl bg-[var(--navy)] px-3 py-1.5 font-bold text-white">إعادة المحاولة</button></p> : <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="es-shimmer h-12 rounded-xl" />)}</div>) : <>
      <table className="hidden w-full text-[14px] md:table">
        <thead><tr className="border-b border-[var(--border)] bg-[var(--sky-light)] text-right text-[12.5px] text-[var(--muted)]">
          <th className="w-12 px-4 py-2.5"><input type="checkbox" aria-label="اختار الكل" className="h-5 w-5 accent-[#10484f]" checked={!!list.length && list.every(r => sel.includes(r.id))} onChange={e => setSel(e.target.checked ? list.map(r => r.id) : [])} /></th>
          <th className="font-bold">الطبيب</th><th className="font-bold">المندوب</th><th className="font-bold">الوقت</th><th className="font-bold">السبب</th><th className="px-4 font-bold">الحالة</th></tr></thead>
        <tbody>{list.map(r => <tr key={r.id} onClick={() => setOpen(r.id)} className={`cursor-pointer border-b border-[var(--border)] transition-colors duration-150 last:border-0 ${sel.includes(r.id) ? "bg-[var(--sky-soft)]/60" : "hover:bg-[var(--sky-light)]"}`}>
          <td className="px-4 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`اختار ${r.doctor}`} className="h-5 w-5 accent-[#10484f]" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>
          <td><b className="block" dir="auto">{r.doctor}</b><span className="text-[12px] text-[var(--muted)]" dir="auto">{r.clinic}</span></td><td>{r.rep}</td><td className="text-[var(--muted)]">{dm(r.day)}، {r.hm}</td>
          <td><div className="flex flex-wrap gap-1">{r.issues.map(i => <span key={i} className="rounded-lg bg-amber-50 px-2 py-0.5 text-[12px] font-bold text-amber-800">{ISSUE[i]}</span>)}</div></td>
          <td className="px-4"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${ST[r.status][1]}`}>{ST[r.status][0]}</span></td></tr>)}</tbody>
      </table>
      <ul className="divide-y divide-[var(--border)] md:hidden">{list.map(r => <li key={r.id} className={`flex items-start gap-3 px-4 py-3.5 ${sel.includes(r.id) ? "bg-[var(--sky-soft)]/60" : ""}`}>
        <input type="checkbox" aria-label={`اختار ${r.doctor}`} className="mt-1 h-6 w-6 shrink-0 accent-[#10484f]" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
        <button type="button" onClick={() => setOpen(r.id)} className="min-w-0 flex-1 text-right"><div className="flex items-center justify-between gap-2"><b className="truncate" dir="auto">{r.doctor}</b><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${ST[r.status][1]}`}>{ST[r.status][0]}</span></div>
          <p className="text-[12.5px] text-[var(--muted)]">{r.rep}، {dm(r.day)} {r.hm}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">{r.issues.map(i => <span key={i} className="rounded-lg bg-amber-50 px-2 py-0.5 text-[11.5px] font-bold text-amber-800">{ISSUE[i]}</span>)}</div></button></li>)}</ul>
      {!list.length && <p className="px-6 py-12 text-center text-[var(--muted)]">{status === "review" && !issue && !rep ? "مفيش زيارات محتاجة مراجعة ✓" : "مفيش زيارات بالفلاتر دي. شيل فلتر عشان تشوف أكتر."}</p>}
      </>}
    </div>

    {sel.length > 0 && createPortal(<div className="ut-in fixed inset-x-0 bottom-[5.5rem] z-[70] px-3 lg:bottom-6" dir="rtl"><div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl bg-[var(--navy)] p-2 pr-4 text-white shadow-2xl">
      <span className="flex-1 text-[14px] font-bold">{sel.length} محددة</span>
      <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-[#33b3a6] px-4 text-[14px] font-extrabold text-[#0b1d20] disabled:opacity-50" onClick={() => void approve(sel)}>{busy ? "…" : "اعتماد المحدد"}</button>
      <button type="button" className="min-h-11 rounded-xl px-4 text-[14px] font-bold text-white/90 hover:bg-white/10" onClick={() => setFixIds(sel)}>طلب تصحيح</button></div></div>, document.body)}

    {openRow && <Drawer row={openRow} onClose={() => { setOpen(null); const q = new URLSearchParams(sp.toString()); if (q.has("open")) { q.delete("open"); router.replace(`${path}?${q}`, { scroll: false }); } }}
      onApprove={() => void approve([openRow.id])} onFix={() => setFixIds([openRow.id])} busy={busy} />}
    {fixIds && <FixPopup fix={fixIds.length === 1 ? (() => { const r = all.find(x => x.id === fixIds[0])!; return { id: r.id, doctor: r.doctor, rep: r.rep, day: r.day, hm: r.hm, notes: r.notes, issues: r.issues }; })() : null} ids={fixIds.length > 1 ? fixIds : undefined}
      onClose={() => setFixIds(null)} onDone={() => { const ids = fixIds; setFixIds(null); mark(ids, "fix"); setSel([]); setOpen(null); undo({ text: ids.length === 1 ? "اتبعت طلب التصحيح للمندوب" : `اتبعت طلب تصحيح لـ ${ids.length} زيارات`, undo: async () => { await fetch("/api/admin/review", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null); mark(ids, "review"); } }); }} />}
    {rulesOpen && data && <RulesPopup rules={data.rules} onClose={() => setRulesOpen(false)} onSaved={() => { setRulesOpen(false); undo({ text: "اتحفظت قواعد المراجعة" }); void load(); }} />}
  </div>;
}

type Detail = { visit: { notes: string; status: string; lat: number | null; lng: number | null; accuracy_m: number | null; follow_up_at: string | null; rep: string; doctor: string; clinic: string; city: string; presented: Array<{ name: string; reaction: string }> };
  attachments: Array<{ id: string; file_name: string; mime_type: string }>; history: Array<{ action: string; detail: string; at: string; who: string }> };
const ACT: Record<string, string> = { created: "سجّل الزيارة", edited: "عدّل الزيارة", approved: "اعتمدها", correction: "طلب تصحيح", undo: "رجع في القرار" };
const RX: Record<string, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
function Drawer({ row, onClose, onApprove, onFix, busy }: { row: Row; onClose: () => void; onApprove: () => void; onFix: () => void; busy: boolean }) {
  const [d, setD] = useState<Detail | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { let alive = true; setD(null); fetch(`/api/admin/review/${row.id}`, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(j => { if (alive) setD(j); }).catch(() => alive && setErr(true)); return () => { alive = false; }; }, [row.id, row.status]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return createPortal(<div className="fixed inset-0 z-[75] flex justify-end" role="dialog" aria-modal="true" aria-label={`زيارة ${row.doctor}`} dir="rtl">
    <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-[#0b1d20]/35 max-md:hidden" />
    <aside className="dr-in relative flex h-dvh w-full flex-col bg-white shadow-2xl md:max-w-[460px]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3"><button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-11 w-11 place-items-center rounded-full text-lg hover:bg-[var(--bg)]">✕</button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold text-[var(--navy)]" dir="auto">{row.doctor}</h2><span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${ST[row.status][1]}`}>{ST[row.status][0]}</span></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--sky-light)] p-4 text-[13.5px]">{[["العيادة", row.clinic || "—"], ["المندوب", row.rep], ["الوقت", `${dm(row.day)}، ${row.hm}`], ["الموقع", d?.visit.lat == null ? "مش متسجل" : row.distance_m != null ? `على بعد ${row.distance_m} م من العيادة` : "متسجل"]].map(([a, b]) => <div key={a}><dt className="text-[12px] text-[var(--muted)]">{a}</dt><dd className="font-bold" dir="auto">{b}</dd></div>)}</dl>
        <div className="flex flex-wrap gap-1.5">{row.issues.map(i => <span key={i} className="rounded-lg bg-amber-50 px-2.5 py-1 text-[12.5px] font-bold text-amber-800">⚠ {ISSUE[i]}</span>)}</div>
        {row.status === "fix" && row.reason && <p className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-[13px] text-sky-900"><b>طلب التصحيح:</b> {row.reason}</p>}
        <div><h3 className="mb-1.5 text-[14px] font-extrabold">الملاحظات</h3><p className="rounded-2xl border border-[var(--border)] p-3 text-[14px] leading-7" dir="auto">{row.notes || "—"}</p></div>
        <div><h3 className="mb-1.5 text-[14px] font-extrabold">المنتجات</h3>{d?.visit.presented.length ? <div className="flex flex-wrap gap-1.5">{d.visit.presented.map(p => <span key={p.name} className="rounded-full bg-[var(--bg)] px-3 py-1 text-[12.5px] font-bold" dir="auto">{RX[p.reaction] || ""} {p.name}</span>)}</div> : <p className="text-[13px] text-[var(--muted)]">{d ? "مفيش منتجات اتعرضت" : "…"}</p>}</div>
        <div><h3 className="mb-2 text-[14px] font-extrabold">المرفقات ({d?.attachments.length ?? row.attachments})</h3>
          {d?.attachments.length ? <div className="grid grid-cols-3 gap-2">{d.attachments.map(a => <a key={a.id} href={`/api/visits/${row.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
            {a.mime_type.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/visits/${row.id}/attachments/${a.id}`} alt={a.file_name} loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-xs font-bold">PDF</span>}</a>)}</div> : <p className="text-[13px] text-[var(--muted)]">{d ? "مفيش مرفقات" : "…"}</p>}</div>
        <div><h3 className="mb-2 text-[14px] font-extrabold">سجل التعديلات</h3>
          {err ? <p className="text-[13px] text-[#c92f36]">تعذر تحميل السجل</p> : !d ? <div className="es-shimmer h-16 rounded-xl" /> :
          <ol className="relative space-y-3 border-r-2 border-[var(--border)] pr-4">{d.history.map((h, i) => <li key={i} className="relative"><span className="absolute -right-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[var(--sky)]" />
            <p className="text-[13.5px]"><b>{h.who || "النظام"}</b> {ACT[h.action] || h.action}{h.detail ? <span className="text-[var(--muted)]"> — {h.detail}</span> : null}</p>
            <p className="text-[11.5px] text-[var(--muted)]">{new Date(h.at).toLocaleString("ar-EG-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}</p></li>)}</ol>}</div>
      </div>
      {row.status !== "ok" && <div className="flex gap-2 border-t border-[var(--border)] p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button type="button" disabled={busy} className={`${btnPrimary} flex-1`} onClick={onApprove}>{busy ? "…" : "اعتماد الزيارة"}</button><button type="button" className={btnSoft} onClick={onFix}>طلب تصحيح</button></div>}
    </aside>
    <style>{`@media (prefers-reduced-motion:no-preference){@keyframes dr{from{transform:translateX(-24px);opacity:.4}to{transform:none;opacity:1}}.dr-in{animation:dr .2s cubic-bezier(.2,.8,.2,1) both}}`}</style>
  </div>, document.body);
}

function RulesPopup({ rules, onClose, onSaved }: { rules: Rules; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ min_notes: String(rules.min_notes), far_m: String(rules.far_m), days: String(rules.days) });
  const [e, setE] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState("");
  const save = async () => {
    if (busy) return; setBusy(true); setFail(""); setE({});
    const r = await fetch("/api/admin/review/rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ min_notes: Number(v.min_notes), far_m: Number(v.far_m), days: Number(v.days) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null; setBusy(false);
    if (!r?.ok) { if (j?.field) setE({ [j.field]: j.error }); else setFail(j?.error || "تعذر الحفظ، حاول تاني"); return; } onSaved();
  };
  const num = (key: keyof typeof v, label: string, hint: string) => <div className="mt-4 first:mt-0"><Field label={label} hint={hint} error={e[key]}><input inputMode="numeric" value={v[key]} onChange={ev => setV(x => ({ ...x, [key]: ev.target.value.replace(/\D/g, "") }))} aria-invalid={!!e[key]} className={fieldCls} /></Field></div>;
  return <Sheet title="قواعد مراجعة الزيارات" onClose={onClose} footer={<><button type="button" disabled={busy} className={`${btnPrimary} flex-1`} onClick={() => void save()}>{busy ? "بيتحفظ…" : "حفظ القواعد"}</button><button type="button" className={btnGhost} onClick={onClose}>إلغاء</button></>}>
    <p className="mb-4 text-[13px] text-[var(--muted)]">الزيارة بتدخل قائمة المراجعة لو اتسجلت من غير موقع، أو ملاحظاتها أقصر من الحد، أو بعيدة عن مكان العيادة أكتر من المسافة دي.</p>
    {num("min_notes", "أقل طول للملاحظات (حرف)", "من 0 لـ 200")}
    {num("far_m", "أقصى بُعد عن العيادة (متر)", "من 50 متر لـ 20 كم")}
    {num("days", "فترة المراجعة (يوم)", "من يوم لـ 60 يوم")}
    <FailBox text={fail} />
  </Sheet>;
}
