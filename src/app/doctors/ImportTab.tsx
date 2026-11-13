"use client";
import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { ArchivedDoctors, ImportHistory } from "./ImportExtras";

type Change = Record<string, [string, string]>;
type Result = {
  sheet: string; rows: number; skipped: number[]; duplicates: Array<{ line: number; name: string; sameAs: number }>;
  add: number; update: number; same: number; archive: number; delete: number; activeNow: number;
  sample: {
    add: Array<{ name: string; clinic: string; city: string }>;
    update: Array<{ name: string; clinic: string; changes: Change; reactivate: boolean }>;
    remove: Array<{ name: string; clinic: string; city: string; archived: boolean }>;
  };
  failed?: Array<{ line: number; name: string }>;
};
const FIELD: Record<string, string> = { name: "الاسم", clinic_name: "العيادة", city: "المدينة", specialty: "التخصص", classification: "التصنيف", phone: "الجوال", email: "البريد" };

/** Admin: upload an Excel doctor list that replaces the doctor database (preview first, then apply). */
export default function ImportTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState<K>("");
  const [ver, setVer] = useState(0);
  const changed = () => { setVer(v => v + 1); onChanged(); };

  async function send(f: File, apply: boolean) {
    setBusy(apply ? "apply" : "preview");
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch(`/api/admin/doctor-import${apply ? `?apply=1${ok ? "&confirmBig=1" : ""}` : ""}`, { method: "POST", body: fd }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null; setBusy("");
    if (!r || !r.ok) { toast(j?.error || "تعذر رفع الملف", "error"); return; }
    if (apply) {
      const failed = j.failed?.length || 0;
      toast(`اتحدثت قاعدة الأطباء ✓ — ${j.add - failed} جديد، ${j.update} اتعدل، ${j.archive + j.delete} اتشال`, "success");
      setRes(null); setFile(null); setOk(false); if (input.current) input.current.value = ""; changed();
      if (failed) toast(`${failed} صف ماتحفظش لأنه متكرر مع طبيب تاني بنفس الاسم والعيادة والتليفون: ${j.failed.slice(0, 5).map((x: { name: string }) => x.name).join("، ")}`, "info");
      return;
    }
    setRes(j); setOk(false); setOpen("");
  }

  const removing = res ? res.archive + res.delete : 0;
  const big = !!res && res.activeNow > 0 && removing / res.activeNow > 0.3;
  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--navy)]">تحديث قاعدة الأطباء من إكسيل</h2>
          <p className="text-sm text-[var(--muted)]">الملف بيبقى هو قائمة الأطباء: الجديد بيتضاف، الموجود بيتحدث، واللي مش في الملف بيتشال. الطبيب اللي ليه زيارات أو خطط بيتأرشف بدل ما يتمسح، عشان تاريخه وتقاريره تفضل موجودة.</p>
        </div>
        <ol className="text-sm space-y-1 list-decimal ps-5 text-[var(--navy)]">
          <li>نزّل القائمة الحالية: <a href="/api/admin/doctor-import" className="font-bold text-teal-700 underline">⬇ قائمة الأطباء الحالية (إكسيل)</a>. عدّل عليها أو استخدم ملفك.</li>
          <li>الأعمدة: <b>اسم الطبيب</b> (لازم)، العيادة، المدينة، التخصص، التصنيف، الجوال، البريد. عمود «المعرف» اختياري، ويخلّي المطابقة أدق لو سبته زي ما هو.</li>
          <li>ارفع الملف وراجع التغييرات قبل ما تأكد. مفيش حاجة بتتغير قبل التأكيد.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); void send(f, false); } }} />
          <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="h-10 rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy === "preview" ? "بقرا الملف…" : file ? "اختار ملف تاني" : "📤 اختار ملف الإكسيل"}
          </button>
          {file && <span className="text-sm text-[var(--muted)] truncate max-w-full">{file.name}</span>}
        </div>
      </div>

      {res && file && <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-3">
        <div className="text-sm text-[var(--muted)]">شيت «{res.sheet}»: {res.rows} طبيب في الملف · دلوقتي في النظام {res.activeNow} طبيب نشط</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat n={res.add} label="جديد هيتضاف" tone="bg-emerald-50 text-emerald-800" k="add" open={open} setOpen={setOpen} />
          <Stat n={res.update} label="بياناته هتتحدث" tone="bg-sky-50 text-sky-800" k="update" open={open} setOpen={setOpen} />
          <Stat n={res.same} label="زي ما هو" tone="bg-slate-50 text-slate-700" open={open} setOpen={setOpen} />
          <Stat n={removing} label="هيتشال" tone="bg-red-50 text-red-800" k="remove" open={open} setOpen={setOpen} />
        </div>
        {removing > 0 && <p className="text-xs text-[var(--muted)]">من اللي هيتشالوا: {res.archive} هيتأرشفوا (ليهم زيارات أو خطط، وتاريخهم هيفضل في التقارير) و{res.delete} هيتمسحوا نهائي (مالهمش أي تاريخ).</p>}

        {open === "add" && <List items={res.sample.add.map(x => `${x.name} — ${x.clinic || "بدون عيادة"}${x.city ? ` · ${x.city}` : ""}`)} total={res.add} />}
        {open === "update" && <List items={res.sample.update.map(x => `${x.name}: ${x.reactivate ? "يرجع نشط" : ""}${x.reactivate && Object.keys(x.changes).length ? " · " : ""}${Object.entries(x.changes).map(([f, [a, b]]) => `${FIELD[f] || f} «${a || "—"}» ← «${b}»`).join(" · ")}`)} total={res.update} />}
        {open === "remove" && <List items={res.sample.remove.map(x => `${x.name} — ${x.clinic || "بدون عيادة"}${x.archived ? " (أرشيف)" : " (مسح)"}`)} total={removing} />}

        {(res.duplicates.length > 0 || res.skipped.length > 0) && <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          {res.duplicates.length > 0 && <div>⚠ {res.duplicates.length} صف متكرر (نفس الطبيب ونفس العيادة) واتاخد أول واحد بس: {res.duplicates.slice(0, 8).map(d => `صف ${d.line} = صف ${d.sameAs}`).join("، ")}</div>}
          {res.skipped.length > 0 && <div>⚠ {res.skipped.length} صف من غير اسم طبيب اتجاهلوا: صفوف {res.skipped.slice(0, 15).join("، ")}</div>}
        </div>}

        {big && <label className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
          <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1" />
          <span>الملف ده هيشيل {removing} طبيب من {res.activeNow} ({Math.round(removing / res.activeNow * 100)}%). اتأكد إنه الملف الكامل مش جزء منه. أنا متأكد، كمّل.</span>
        </label>}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || (big && !ok) || (!res.add && !res.update && !removing)} onClick={() => send(file, true)} className="h-10 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-40">
            {busy === "apply" ? "بحدّث…" : "✓ أكّد وحدّث قاعدة الأطباء"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => { setRes(null); setFile(null); if (input.current) input.current.value = ""; }} className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-bold">إلغاء</button>
        </div>
      </div>}
      <ImportHistory reload={ver} onChanged={changed} />
      <ArchivedDoctors reload={ver} onChanged={changed} />
    </div>
  );
}

type K = "" | "add" | "update" | "remove";
function Stat({ n, label, tone, k, open, setOpen }: { n: number; label: string; tone: string; k?: Exclude<K, "">; open: K; setOpen: (k: K) => void }) {
  return <button type="button" disabled={!k || !n} onClick={() => k && setOpen(open === k ? "" : k)} className={`rounded-2xl p-3 text-start ${tone} ${k && n ? "hover:ring-2 ring-black/10" : "cursor-default"}`}>
    <div className="text-2xl font-extrabold">{n}</div><div className="text-xs font-bold">{label}{k && n ? " ▾" : ""}</div>
  </button>;
}

function List({ items, total }: { items: string[]; total: number }) {
  return <div className="max-h-72 overflow-y-auto rounded-2xl border border-[var(--border)] p-2 text-sm">
    {items.map((t, i) => <div key={i} className="border-b border-[var(--border)] last:border-0 py-1.5 break-words">{t}</div>)}
    {total > items.length && <div className="pt-1.5 text-xs text-[var(--muted)]">و {total - items.length} كمان…</div>}
  </div>;
}
