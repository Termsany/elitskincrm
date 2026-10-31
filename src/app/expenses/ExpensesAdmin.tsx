"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { type Cat, type Exp, sar, StatusPill, CatIcon, Receipts, Flags, tone } from "./shared";

type Tab = "review" | "all" | "pnl" | "settings";
type Rep = { id: string; name: string };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const firstOfMonth = () => `${today().slice(0, 7)}-01`;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function ExpensesAdmin({ reps, initialTab }: { reps: Rep[]; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pendingCount, setPendingCount] = useState(0);
  const tabs: Array<[Tab, string, string]> = [["review", "للمراجعة", "plans"], ["all", "كل المصروفات", "file"], ["pnl", "الربحية", "sales"], ["settings", "البنود والسقوف", "work"]];
  return <div className="mt-5 space-y-4">
    <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5">{tabs.map(([k, l, i]) =>
      <button key={k} type="button" onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === k ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>
        <Icon name={i} size={17} />{l}{k === "review" && pendingCount > 0 && <span className={`rounded-full px-1.5 text-[11px] ${tab === k ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{pendingCount}</span>}</button>)}</div>
    {tab === "review" && <ExpenseList mode="review" reps={reps} onCount={setPendingCount} />}
    {tab === "all" && <ExpenseList mode="all" reps={reps} onCount={() => {}} />}
    {tab === "pnl" && <Pnl reps={reps} />}
    {tab === "settings" && <Settings />}
  </div>;
}

function ExpenseList({ mode, reps, onCount }: { mode: "review" | "all"; reps: Rep[]; onCount: (n: number) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Exp[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [f, setF] = useState({ repId: "", status: mode === "review" ? "pending" : "all", from: mode === "review" ? "" : firstOfMonth(), to: mode === "review" ? "" : today() });
  const [note, setNote] = useState(""); const [ref, setRef] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    const j = await fetch(`/api/expenses?${p}`).then(r => r.json()).catch(() => null);
    const list: Exp[] = j?.expenses || []; setRows(list); setSel([]); if (mode === "review") onCount(list.length);
  }, [f, mode, onCount]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: "approve" | "reject" | "reimburse", ids = sel) => {
    if (!ids.length) return;
    if (action === "reject" && note.trim().length < 3) { toast("اكتب سبب الرفض في خانة الملاحظة", "error"); return; }
    setBusy(true);
    const r = await fetch("/api/admin/expenses/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, action, note, payment_ref: ref }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast(action === "approve" ? `تم اعتماد ${ids.length}` : action === "reject" ? `تم رفض ${ids.length}` : `تم تسجيل صرف ${ids.length}`, "success"); setNote(""); setRef(""); await load();
  };
  const selRows = (rows || []).filter(r => sel.includes(r.id));
  const selSum = selRows.reduce((a, r) => a + r.amount, 0);
  const total = (rows || []).filter(r => r.status !== "rejected").reduce((a, r) => a + r.amount, 0);
  const canReimburse = selRows.length > 0 && selRows.every(r => r.status === "approved");
  const canDecide = selRows.length > 0 && selRows.every(r => r.status === "pending");
  const exportHref = f.from && f.to ? `/api/admin/expenses/export?${new URLSearchParams({ from: f.from, to: f.to, status: f.status, ...(f.repId ? { repId: f.repId } : {}) })}` : "";

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <label className="text-xs font-bold text-[var(--muted)]">المندوب<select value={f.repId} onChange={e => setF({ ...f, repId: e.target.value })} className="mt-1 block rounded-xl border border-[var(--border)] px-3 py-2 text-sm"><option value="">الكل</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {mode === "all" && <>
        <label className="text-xs font-bold text-[var(--muted)]">الحالة<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className="mt-1 block rounded-xl border border-[var(--border)] px-3 py-2 text-sm"><option value="all">الكل</option><option value="pending">بانتظار الاعتماد</option><option value="approved">معتمد (لم يُصرف)</option><option value="reimbursed">تم الصرف</option><option value="rejected">مرفوض</option></select></label>
        <label className="text-xs font-bold text-[var(--muted)]">من<input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="mt-1 block rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
        <label className="text-xs font-bold text-[var(--muted)]">إلى<input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="mt-1 block rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
        {exportHref && <a href={exportHref} className="mr-auto flex items-center gap-2 rounded-xl bg-[var(--navy)] px-4 py-2.5 text-sm font-bold text-white"><Icon name="reports" size={16} />تصدير Excel</a>}
      </>}
      <div className={`${mode === "all" ? "" : "mr-auto"} text-left text-xs text-[var(--muted)]`}>{rows?.length ?? 0} مصروف · <b className="text-[var(--navy)]">{sar(total)}</b></div>
    </div>

    {sel.length > 0 && <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--navy)] p-3 text-white shadow-xl">
      <b className="text-sm">{sel.length} محدد · {sar(selSum)}</b>
      {canDecide && <><input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة (مطلوبة للرفض)" className="min-w-40 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm placeholder:text-white/50 !outline-none" />
        <button type="button" disabled={busy} onClick={() => void act("approve")} className="rounded-xl bg-[var(--sky)] px-4 py-2 text-sm font-bold">اعتماد</button>
        <button type="button" disabled={busy} onClick={() => void act("reject")} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/20">رفض</button></>}
      {canReimburse && <><input value={ref} onChange={e => setRef(e.target.value)} placeholder="مرجع التحويل / سند الصرف" className="min-w-40 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm placeholder:text-white/50 !outline-none" />
        <button type="button" disabled={busy} onClick={() => void act("reimburse")} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold">تسجيل الصرف</button></>}
      {!canDecide && !canReimburse && <span className="text-xs text-white/70">اختار مصروفات بنفس الحالة (معلّقة للاعتماد، أو معتمدة للصرف)</span>}
      <button type="button" onClick={() => setSel([])} className="mr-auto rounded-xl px-3 py-2 text-xs text-white/70 hover:bg-white/10">إلغاء</button>
    </div>}

    {rows === null ? <div className="h-48 animate-pulse rounded-2xl bg-white" /> : !rows.length ? <div className="rounded-2xl border border-[var(--border)] bg-white p-10 text-center"><div className="es-pop mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon name="sparkle" size={28} /></div><div className="mt-3 font-extrabold text-[var(--navy)]">{mode === "review" ? "مفيش مصروفات مستنية اعتماد" : "مفيش مصروفات في الفترة دي"}</div></div>
      : <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <label className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-xs font-bold text-[var(--muted)]"><input type="checkbox" className="h-4 w-4 accent-[var(--sky)]" checked={sel.length === rows.length} onChange={e => setSel(e.target.checked ? rows.map(r => r.id) : [])} />تحديد الكل</label>
        <div className="divide-y divide-[var(--border)]">{rows.map(e => <div key={e.id} className={`flex gap-3 p-4 transition ${sel.includes(e.id) ? "bg-[var(--sky-light)]" : ""}`}>
          <input type="checkbox" className="mt-3 h-4 w-4 shrink-0 accent-[var(--sky)]" checked={sel.includes(e.id)} onChange={x => setSel(x.target.checked ? [...sel, e.id] : sel.filter(i => i !== e.id))} aria-label="تحديد" />
          <CatIcon code={e.category_code} icon={e.category_icon} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{e.rep_name}</b><span className="text-xs text-[var(--muted)]">{e.category_name} · {e.expense_date}{e.merchant ? ` · ${e.merchant}` : ""}</span><StatusPill s={e.status} /></div>
            <div className="text-sm">{e.description}{e.doctor_name && <span className="text-[var(--muted)]"> — د. {e.doctor_name}</span>}</div>
            <Flags flags={e.flags} /><Receipts e={e} />
            {e.review_note && <div className="text-[11px] text-[var(--muted)]">ملاحظة: {e.review_note}{e.reviewer_name ? ` (${e.reviewer_name})` : ""}</div>}
            {e.payment_ref && <div className="text-[11px] text-[var(--muted)]">مرجع الصرف: {e.payment_ref}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2"><b className="text-base">{sar(e.amount)}</b>{e.vat_amount > 0 && <span className="text-[10px] text-[var(--muted)]">ض.ق.م {sar(e.vat_amount)}</span>}
            {e.status === "pending" && <div className="flex gap-1"><button type="button" disabled={busy} title="اعتماد" onClick={() => void act("approve", [e.id])} className="rounded-lg bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"><Icon name="check" size={16} /></button>
              <button type="button" disabled={busy} title="رفض (اكتب السبب بعد التحديد)" onClick={() => setSel([e.id])} className="rounded-lg bg-red-50 p-2 text-red-700 ring-1 ring-red-200 hover:bg-red-100"><Icon name="x" size={16} /></button></div>}
          </div>
        </div>)}</div>
      </div>}
  </div>;
}

type PnlRow = { rep_id: string; rep_name: string; month: number; revenue: number; expenses: number; pending: number; visits: number };
type PnlData = { year: number; rows: PnlRow[]; byCategory: Array<{ name: string; code: string; v: number }>; byDoctor: Array<{ name: string; v: number; n: number }> };
function Pnl({ reps }: { reps: Rep[] }) {
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [repId, setRepId] = useState("");
  const [d, setD] = useState<PnlData | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setD(null); fetch(`/api/admin/expenses/pnl?year=${year}${repId ? `&repId=${repId}` : ""}`).then(r => r.json()).then(setD).catch(() => setD({ year, rows: [], byCategory: [], byDoctor: [] })); }, [year, repId]);
  const months = useMemo(() => MONTHS.map((_, i) => { const r = (d?.rows || []).filter(x => x.month === i + 1); return { rev: r.reduce((a, x) => a + x.revenue, 0), exp: r.reduce((a, x) => a + x.expenses, 0) }; }), [d]);
  const per = useMemo(() => { const m = new Map<string, { name: string; rev: number; exp: number; pend: number; vis: number }>(); for (const x of d?.rows || []) { const o = m.get(x.rep_id) || { name: x.rep_name, rev: 0, exp: 0, pend: 0, vis: 0 }; o.rev += x.revenue; o.exp += x.expenses; o.pend += x.pending; o.vis += x.visits; m.set(x.rep_id, o); } return [...m.values()].sort((a, b) => (b.rev - b.exp) - (a.rev - a.exp)); }, [d]);
  const T = per.reduce((a, x) => ({ rev: a.rev + x.rev, exp: a.exp + x.exp, pend: a.pend + x.pend, vis: a.vis + x.vis }), { rev: 0, exp: 0, pend: 0, vis: 0 });
  const max = Math.max(1, ...months.flatMap(m => [m.rev, m.exp]));
  const catTotal = (d?.byCategory || []).reduce((a, c) => a + c.v, 0);
  const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : "—";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="flex items-center gap-1 rounded-xl bg-[var(--bg)] p-1"><button type="button" onClick={() => setYear(year - 1)} className="rounded-lg px-2 py-1.5 hover:bg-white">›</button><b className="px-2">{year}</b><button type="button" onClick={() => setYear(year + 1)} className="rounded-lg px-2 py-1.5 hover:bg-white">‹</button></div>
      <select value={repId} onChange={e => setRepId(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <span className="mr-auto max-w-md text-[11px] leading-5 text-[var(--muted)]">الإيراد = المبيعات المعتمدة (صافي المرتجعات). المصروف = المعتمد والمصروف فعلاً. المساهمة قبل تكلفة البضاعة والرواتب.</span>
    </div>
    {!d ? <div className="h-64 animate-pulse rounded-2xl bg-white" /> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["الإيراد", sar(T.rev), "sales", "#1aa865", ""], ["المصروفات", sar(T.exp), "wallet", "#e16201", T.pend ? `+ ${sar(T.pend)} بانتظار الاعتماد` : ""], ["مساهمة المناديب", sar(T.rev - T.exp), "trophy", "#15646a", `هامش ${pct(T.rev - T.exp, T.rev)}`], ["نسبة المصروف للمبيعات", pct(T.exp, T.rev), "coverage", "#3b90e8", T.vis ? `${sar(Math.round(T.exp / T.vis))} لكل زيارة` : ""]] as const).map(([l, v, i, c, s]) =>
          <div key={l} className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--muted)]">{l}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: c, background: `${c}1f` }}><Icon name={i} size={18} /></span></div><div className="mt-2 text-xl font-extrabold text-[var(--navy)] sm:text-2xl">{v}</div>{s && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{s}</div>}</div>)}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="mb-1 flex items-center justify-between"><h3 className="font-extrabold text-[var(--navy)]">الإيراد مقابل المصروف — شهر بشهر</h3><div className="flex gap-3 text-[11px] text-[var(--muted)]"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />إيراد</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-orange-500" />مصروف</span></div></div>
        <div className="h-6 text-xs text-[var(--muted)]">{hover !== null ? <span><b className="text-[var(--navy)]">{MONTHS[hover]}</b> · إيراد {sar(months[hover].rev)} · مصروف {sar(months[hover].exp)} · مساهمة <b>{sar(months[hover].rev - months[hover].exp)}</b></span> : "مرّر على أي شهر"}</div>
        <div className="flex h-48 items-end gap-1.5 sm:gap-3" dir="rtl">{months.map((m, i) => <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-40 w-full items-end justify-center gap-0.5">{[[m.rev, "bg-emerald-500"], [m.exp, "bg-orange-500"]].map(([v, c], j) => <div key={j} className={`w-1/2 max-w-4 rounded-t ${c} transition-[height] duration-700 ${hover === i ? "opacity-100" : "opacity-80"}`} style={{ height: `${Math.max(Number(v) ? 3 : 0, Number(v) / max * 100)}%` }} />)}</div>
          <span className={`text-[9.5px] ${hover === i ? "font-bold text-[var(--navy)]" : "text-[var(--muted)]"}`}>{MONTHS[i].slice(0, 3)}</span></div>)}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white lg:col-span-2">
          <table className="w-full min-w-[560px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">المندوب</th><th className="p-3">الإيراد</th><th className="p-3">المصروف</th><th className="p-3">المساهمة</th><th className="p-3">الهامش</th><th className="p-3">مصروف/زيارة</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{per.map(x => { const c = x.rev - x.exp; return <tr key={x.name}><td className="p-3 font-bold">{x.name}{x.pend > 0 && <div className="text-[10.5px] font-normal text-amber-700">+ {sar(x.pend)} بانتظار الاعتماد</div>}</td><td className="p-3 text-center">{sar(x.rev)}</td><td className="p-3 text-center">{sar(x.exp)}</td><td className={`p-3 text-center font-extrabold ${c < 0 ? "text-red-700" : "text-emerald-700"}`}>{sar(c)}</td><td className="p-3 text-center">{pct(c, x.rev)}</td><td className="p-3 text-center">{x.vis ? sar(Math.round(x.exp / x.vis)) : "—"}</td></tr>; })}
              {!per.length && <tr><td colSpan={6} className="p-6 text-center text-[var(--muted)]">مفيش بيانات للسنة دي</td></tr>}</tbody></table>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><h3 className="mb-3 font-extrabold text-[var(--navy)]">المصروف حسب البند</h3>
            {(d.byCategory.length ? d.byCategory : []).map(c => <div key={c.code} className="mb-2.5"><div className="mb-1 flex justify-between text-xs"><span className="font-bold">{c.name}</span><span className="text-[var(--muted)]">{sar(c.v)} · {pct(c.v, catTotal)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full" style={{ width: `${c.v / (catTotal || 1) * 100}%`, background: tone(c.code) }} /></div></div>)}
            {!d.byCategory.length && <div className="text-sm text-[var(--muted)]">لا توجد مصروفات معتمدة</div>}</div>
          {d.byDoctor.length > 0 && <div className="rounded-2xl border border-[var(--border)] bg-white p-4"><h3 className="mb-2 font-extrabold text-[var(--navy)]">أعلى صرف على الأطباء</h3>{d.byDoctor.map(x => <div key={x.name} className="flex justify-between border-t border-[var(--border)] py-2 text-sm first:border-0"><span className="truncate">{x.name}</span><b>{sar(x.v)}</b></div>)}</div>}
        </div>
      </div>
    </>}
  </div>;
}

function Settings() {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const load = useCallback(() => fetch("/api/admin/expenses/categories").then(r => r.json()).then(j => setCats(j.categories)).catch(() => setCats([])), []);
  useEffect(() => { void load(); }, [load]);
  const save = async (c: Cat) => { const r = await fetch("/api/admin/expenses/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, monthly_cap: c.monthly_cap, receipt_required_above: c.receipt_required_above, active: c.active }) }); toast(r.ok ? `اتحفظ: ${c.name}` : "تعذر الحفظ", r.ok ? "success" : "error"); };
  const set = (id: string, patch: Partial<Cat>) => setCats(cs => (cs || []).map(c => c.id === id ? { ...c, ...patch } : c));
  if (!cats) return <div className="h-48 animate-pulse rounded-2xl bg-white" />;
  return <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
    <table className="w-full min-w-[640px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">البند</th><th className="p-3">السقف الشهري للمندوب</th><th className="p-3">الإيصال إلزامي فوق</th><th className="p-3">مفعّل</th><th /></tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{cats.map(c => <tr key={c.id}>
        <td className="p-3"><div className="flex items-center gap-2.5"><CatIcon code={c.code} icon={c.icon} size={34} /><b>{c.name}</b></div></td>
        <td className="p-3 text-center"><input inputMode="decimal" value={c.monthly_cap ?? ""} placeholder="بدون سقف" onChange={e => set(c.id, { monthly_cap: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) })} className="w-28 rounded-xl border border-[var(--border)] px-2 py-1.5 text-center" /></td>
        <td className="p-3 text-center"><input inputMode="decimal" value={c.receipt_required_above} onChange={e => set(c.id, { receipt_required_above: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} className="w-24 rounded-xl border border-[var(--border)] px-2 py-1.5 text-center" /></td>
        <td className="p-3 text-center"><input type="checkbox" checked={c.active} onChange={e => set(c.id, { active: e.target.checked })} className="h-5 w-5 accent-[var(--sky)]" /></td>
        <td className="p-3"><button type="button" onClick={() => void save(c)} className="rounded-xl bg-[var(--navy)] px-4 py-1.5 text-xs font-bold text-white">حفظ</button></td>
      </tr>)}</tbody></table>
    <p className="p-3 text-[11px] text-[var(--muted)]">السقف يُحسب لكل مندوب في الشهر. لو اتعدّى، المصروف يظهر للمراجعة بتنبيه — مش بيترفض تلقائياً. الإيصال: لو المبلغ أعلى من الرقم ده لازم صورة الإيصال (0 = دايماً).</p>
  </div>;
}
