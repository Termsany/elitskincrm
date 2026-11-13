"use client";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";

type Who = { name: string; clinic: string };
type Imp = {
  id: string; file_name: string; created_at: string; undone_at: string | null; actor: string | null; can_undo: boolean;
  summary: { rows?: number; add?: number; update?: number; archive?: number; delete?: number; failed?: Array<{ line: number; name: string }>; names?: { add?: Who[]; archive?: Who[]; delete?: Who[] } };
};
type Arch = { id: string; name: string; clinic_name: string; city: string; classification: string; phone: string; email: string; visits: number; last_visit: string | null };

const when = (s: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(s));

/** Last uploads: what each changed, with undo for the latest one. */
export function ImportHistory({ reload, onChanged }: { reload: number; onChanged: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<Imp[] | null>(null);
  const [open, setOpen] = useState(""); const [busy, setBusy] = useState(""); const [ask, setAsk] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => { fetch("/api/admin/doctor-import?history=1").then(r => r.ok ? r.json() : null).then(j => setList(j?.imports || [])).catch(() => setList([])); }, [reload, n]);

  async function undo(id: string) {
    setBusy(id);
    const r = await fetch("/api/admin/doctor-import/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null; setBusy(""); setAsk("");
    if (!r || !r.ok) { toast(j?.error || "تعذر التراجع", "error"); return; }
    const x = j.result;
    toast(`اتراجعت ✓ — رجع ${x.restored + x.reactivated} طبيب، واتشال ${x.removed} كانوا اتضافوا، واترجعت بيانات ${x.reverted}${x.skipped ? ` (${x.skipped} ماترجعوش لتعارض)` : ""}`, "success");
    setN(v => v + 1); onChanged();
  }

  if (!list?.length) return null;
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-2">
      <h3 className="font-extrabold text-[var(--navy)]">آخر عمليات الرفع</h3>
      {list.map(i => {
        const s = i.summary || {}; const nm = s.names || {};
        return <div key={i.id} className="rounded-2xl border border-[var(--border)] p-3 text-sm space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOpen(open === i.id ? "" : i.id)} className="min-w-0 flex-1 text-start">
              <div className="font-bold truncate">{i.file_name || "ملف"} <span className="text-xs font-normal text-[var(--muted)]">· {when(i.created_at)}{i.actor ? ` · ${i.actor}` : ""}</span></div>
              <div className="text-xs text-[var(--muted)]">+{s.add ?? 0} جديد · {s.update ?? 0} اتعدل · {s.archive ?? 0} اتأرشف · {s.delete ?? 0} اتمسح {open === i.id ? "▴" : "▾"}</div>
            </button>
            {i.undone_at ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">اتراجع عنه</span>
              : i.can_undo && (ask === i.id
                ? <span className="flex gap-1"><button type="button" disabled={!!busy} onClick={() => undo(i.id)} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "…" : "أيوه، تراجع"}</button><button type="button" onClick={() => setAsk("")} className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold">لا</button></span>
                : <button type="button" onClick={() => setAsk(i.id)} className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold">↩ تراجع</button>)}
          </div>
          {open === i.id && <div className="grid gap-2 sm:grid-cols-3 text-xs">
            {([["اتضافوا", nm.add, "text-emerald-700"], ["اتأرشفوا", nm.archive, "text-amber-700"], ["اتمسحوا", nm.delete, "text-red-700"]] as const).map(([l, xs, c]) =>
              <div key={l} className="rounded-xl bg-[var(--bg)] p-2"><div className={`font-bold ${c}`}>{l} ({xs?.length ?? 0})</div>
                <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">{(xs || []).map((d, k) => <div key={k} className="break-words">{d.name}{d.clinic ? ` — ${d.clinic}` : ""}</div>)}{!xs?.length && <div className="text-[var(--muted)]">—</div>}</div></div>)}
            {!!s.failed?.length && <div className="sm:col-span-3 text-amber-800">ماتحفظوش: {s.failed.map(f => `${f.name} (صف ${f.line})`).join("، ")}</div>}
          </div>}
        </div>;
      })}
    </div>
  );
}

/** Archived doctors: search, pick, bring back to active. */
export function ArchivedDoctors({ reload, onChanged }: { reload: number; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Arch[] | null>(null);
  const [q, setQ] = useState(""); const [sel, setSel] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => { fetch("/api/admin/doctor-archive").then(r => r.ok ? r.json() : null).then(j => setRows(j?.doctors || [])).catch(() => setRows([])); }, [reload, n]);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return (rows || []).filter(d => !t || `${d.name} ${d.clinic_name} ${d.city} ${d.phone} ${d.email}`.toLowerCase().includes(t)); }, [rows, q]);

  async function restore(ids: string[]) {
    setBusy(true);
    const r = await fetch("/api/admin/doctor-archive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null; setBusy(false);
    if (!r || !r.ok) { toast(j?.error || "تعذر الإرجاع", "error"); return; }
    toast(`رجع ${j.restored} طبيب للقائمة ✓`, "success"); setSel([]); setN(v => v + 1); onChanged();
  }

  if (!rows?.length) return null;
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-3">
      <button type="button" onClick={() => setShow(x => !x)} className="flex w-full items-center justify-between text-start">
        <span><span className="font-extrabold text-[var(--navy)]">الأطباء المؤرشفين ({rows.length})</span></span>
        <span className="text-[var(--muted)]">{show ? "▴" : "▾"}</span>
      </button>
      {show && <>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 اسم، عيادة، مدينة…" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm" />
          <button type="button" disabled={busy || !sel.length} onClick={() => restore(sel)} className="h-10 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-40">↩ رجّع المختارين ({sel.length})</button>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-2xl border border-[var(--border)] text-sm">
          {list.map(d => <label key={d.id} className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-0 cursor-pointer hover:bg-[var(--bg)]">
            <input type="checkbox" checked={sel.includes(d.id)} onChange={() => setSel(x => x.includes(d.id) ? x.filter(y => y !== d.id) : [...x, d.id])} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1"><span className="font-bold">{d.name}</span>{d.classification && <span className="text-xs text-[var(--muted)]"> · {d.classification}</span>}
              <span className="block truncate text-xs text-[var(--muted)]">{[d.clinic_name, d.city].filter(Boolean).join(" · ") || "—"}{d.visits ? ` · ${d.visits} زيارة، آخرها ${d.last_visit}` : " · مفيش زيارات"}</span></span>
            <button type="button" disabled={busy} onClick={e => { e.preventDefault(); void restore([d.id]); }} className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold">رجّعه</button>
          </label>)}
          {!list.length && <div className="p-3 text-center text-[var(--muted)]">مفيش نتايج</div>}
        </div>
      </>}
    </div>
  );
}
