"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

type CSide = { id: string; name: string; city: string; doctors: number; visits: number; linked: boolean };
type DSide = { id: string; name: string; clinic_name: string; city: string; phone: string; classification: string; visits: number; last_visit: string | null };
type P<S> = { a: string; b: string; strength: "strong" | "possible"; why: string; sides: [S, S] };
type Data = { clinics: P<CSide>[]; doctors: P<DSide>[] };

const score = (s: CSide | DSide) => ("linked" in s ? (s.linked ? 1e6 : 0) + s.doctors * 1000 : 0) + s.visits;
const fmt = (d: string | null) => d ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "—";

/** Admin: likely duplicate clinics and doctors — pick the one to keep, merge, or mark as "not the same". */
export default function MergeTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<"clinic" | "doctor">("clinic");
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState(""); const [busy, setBusy] = useState("");
  useEffect(() => { fetch("/api/admin/merge").then(r => r.ok ? r.json() : null).then(j => setData(j || { clinics: [], doctors: [] })).catch(() => setData({ clinics: [], doctors: [] })); }, []);

  const key = (p: { a: string; b: string }) => `${p.a}:${p.b}`;
  const kept = (p: P<CSide> | P<DSide>) => keep[key(p)] || (score(p.sides[1]) > score(p.sides[0]) ? p.sides[1].id : p.sides[0].id);
  const drop = (gone: string[]) => setData(d => d && ({ clinics: d.clinics.filter(p => !gone.includes(p.a) && !gone.includes(p.b)), doctors: d.doctors.filter(p => !gone.includes(p.a) && !gone.includes(p.b)) }));

  async function merge(p: P<CSide> | P<DSide>) {
    const k = kept(p), dr = k === p.a ? p.b : p.a; setBusy(key(p));
    const r = await fetch("/api/admin/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, keep: k, drop: dr }) });
    const j = await r.json().catch(() => null); setBusy(""); setAsk("");
    if (!r.ok) { toast(j?.error || "تعذر الدمج", "error"); return; }
    toast(kind === "clinic" ? `اتدمجت ✓ — اتنقل ${j.result?.doctors ?? 0} طبيب${j.result?.doctors_merged ? ` واتدمج ${j.result.doctors_merged} طبيب مكرر` : ""}` : "اتدمج الطبيب ✓ — زياراته وخططه ومتابعاته اتنقلت", "success");
    drop([dr]); onChanged();
    if (kind === "clinic") fetch("/api/admin/merge").then(r2 => r2.ok ? r2.json() : null).then(x => x && setData(x)).catch(() => {}); // doctors inside may now pair up
  }
  async function notSame(p: { a: string; b: string }) {
    const r = await fetch("/api/admin/merge", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, a: p.a, b: p.b }) });
    if (!r.ok) { toast("تعذر الحفظ", "error"); return; }
    setData(d => d && (kind === "clinic" ? { ...d, clinics: d.clinics.filter(x => key(x) !== key(p)) } : { ...d, doctors: d.doctors.filter(x => key(x) !== key(p)) }));
    toast("تمام — مش هيظهروا كمكرر تاني", "info");
  }

  if (!data) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-36 rounded-[26px]" />)}</div>;
  const list: Array<P<CSide> | P<DSide>> = kind === "clinic" ? data.clinics : data.doctors;
  return (
    <div className="space-y-3">
      <div className="rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><h2 className="text-lg font-extrabold text-[var(--navy)]">دمج المكرر</h2>
            <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">اختار اللي هيفضل، وكل حاجة على التاني تتنقل له: الأطباء والزيارات والخطط والمتابعات وربط دفترة. التاني بيتقفل ويفضل في السجل — مش بيتمسح.</p></div>
          <div className="flex rounded-xl bg-[var(--bg)] p-1">{([["clinic", `العيادات (${data.clinics.length})`], ["doctor", `الأطباء (${data.doctors.length})`]] as const).map(([k, l]) =>
            <button key={k} type="button" onClick={() => { setKind(k); setAsk(""); }} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${kind === k ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
        </div>
      </div>

      {!list.length && <div className="rounded-[26px] border border-dashed border-[var(--border-strong)] bg-white p-10 text-center text-[var(--muted)]">✓ مفيش {kind === "clinic" ? "عيادات" : "أطباء"} مكررين</div>}
      <div className="grid gap-3 xl:grid-cols-2">
        {list.map((p, i) => { const k = kept(p); const id = key(p); const keepSide = p.sides.find(s => s.id === k)!; const dropSide = p.sides.find(s => s.id !== k)!; return (
          <article key={id} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} className="es-card-in rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.strength === "strong" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{p.strength === "strong" ? "مكرر غالباً" : "اتأكد الأول"}</span>
              <span className="text-xs text-[var(--muted)]">{p.why}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">{p.sides.map(s => { const on = s.id === k; return (
              <button key={s.id} type="button" onClick={() => setKeep(x => ({ ...x, [id]: s.id }))} aria-pressed={on}
                className={`rounded-2xl border-2 p-3 text-right transition ${on ? "border-teal-500 bg-teal-50/60" : "border-[var(--border)] bg-white opacity-80 hover:opacity-100"}`}>
                <div className={`mb-1 text-[10.5px] font-bold ${on ? "text-teal-700" : "text-[var(--muted)]"}`}>{on ? "✓ هيفضل" : "هيتدمج فيه"}</div>
                <div className="break-words font-extrabold text-[var(--navy)]" dir="auto">{s.name}</div>
                {"doctors" in s ? <>
                  <div className="text-[11px] text-[var(--muted)]" dir="auto">{s.city || "—"}</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10.5px] font-bold"><span className="rounded-full bg-[var(--bg)] px-2 py-0.5">{s.doctors} طبيب</span><span className="rounded-full bg-[var(--bg)] px-2 py-0.5">{s.visits} زيارة</span>
                    <span className={`rounded-full px-2 py-0.5 ${s.linked ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.linked ? "مربوطة بدفترة" : "مش مربوطة"}</span></div>
                </> : <>
                  <div className="text-[11px] text-[var(--muted)]" dir="auto">{[s.clinic_name, s.city].filter(Boolean).join(" · ") || "—"}</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10.5px] font-bold">{s.classification && <span className="rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[var(--navy)]">فئة {s.classification}</span>}<span className="rounded-full bg-[var(--bg)] px-2 py-0.5">{s.visits} زيارة</span>
                    <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">آخر زيارة {fmt(s.last_visit)}</span>{s.phone && <span className="rounded-full bg-[var(--bg)] px-2 py-0.5" dir="ltr">{s.phone}</span>}</div>
                </>}
              </button>); })}</div>
            {ask === id ? <div className="es-pop mt-3 rounded-2xl bg-[var(--sky-light)] p-3 text-sm">
                <div className="leading-6">«<b dir="auto">{dropSide.name}</b>» هيتقفل، و{"doctors" in dropSide ? ` ${dropSide.doctors} طبيب و${dropSide.visits} زيارة` : ` ${dropSide.visits} زيارة وخططه ومتابعاته`} هيتنقلوا لـ «<b dir="auto">{keepSide.name}</b>». متأكد؟</div>
                <div className="mt-2 flex gap-2"><button type="button" disabled={busy === id} onClick={() => void merge(p)} className="min-h-10 flex-1 rounded-xl bg-[var(--navy)] text-sm font-bold text-white disabled:opacity-50">{busy === id ? "بيدمج…" : "أيوه، ادمج"}</button>
                  <button type="button" onClick={() => setAsk("")} className="min-h-10 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-bold">لأ</button></div>
              </div>
              : <div className="mt-3 flex gap-2"><button type="button" onClick={() => setAsk(id)} className="min-h-10 flex-1 rounded-xl bg-[var(--navy)] text-sm font-bold text-white">ادمج</button>
                <button type="button" onClick={() => void notSame(p)} className="min-h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--muted)] hover:text-[var(--navy)]">مش مكرر</button></div>}
          </article>); })}
      </div>
    </div>
  );
}
