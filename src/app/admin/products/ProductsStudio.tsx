"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DetailingPresenter from "@/components/detailing/DetailingPresenter";
import { BrochureCover, PageThumb } from "@/components/detailing/BrochureViewer";
import { brochureUrl, loadPdf } from "@/components/detailing/pdf";
import { lines, type Brochure, type DetailProduct } from "@/components/detailing/types";
import { useToast } from "@/components/Toast";

type Stats = { presented: number; interested: number; neutral: number; not_interested: number; doctors: number; reps: number; last: string | null };
type SP = DetailProduct & {
  active: boolean; sort_order: number; created_at: string; reps_count: number; in_use: boolean;
  presentations: Stats; items: { samples: number; orders: number }; detailing: { sessions: number; seconds: number };
  top_pages: Array<{ brochure_id: string | null; page: number; seconds: number }>;
};
type Tab = "info" | "brochures" | "points" | "image" | "stats";
const COLORS = ["#10484f", "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#334155"];
const TABS: Array<[Tab, string]> = [["info", "البيانات"], ["brochures", "البروشورات"], ["points", "نقاط الشرح"], ["image", "الصورة"], ["stats", "الأداء"]];
const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
const ago = (s: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(s));

async function pdfPages(file: File): Promise<number> {
  if (file.type !== "application/pdf") return 1;
  const url = URL.createObjectURL(file);
  try { const d = await loadPdf(url); return d.numPages; } catch { return 1; } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function upload(url: string, method: string, form: FormData, onProgress: (p: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise(resolve => {
    const x = new XMLHttpRequest(); x.open(method, url);
    x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { let error = "تعذر الرفع"; try { error = JSON.parse(x.responseText).error || error; } catch { /* */ } resolve(x.status < 300 ? { ok: true } : { ok: false, error }); };
    x.onerror = () => resolve({ ok: false, error: "انقطع الاتصال" });
    x.send(form);
  });
}

export default function ProductsStudio() {
  const toast = useToast();
  const [ps, setPs] = useState<SP[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [preview, setPreview] = useState<{ id: string; brochureId?: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/products/studio", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); setPs(j.products); setSel(s => s ?? j.products[0]?.id ?? null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const p = ps?.find(x => x.id === sel) || null;
  const shown = useMemo(() => (ps || []).filter(x => !q.trim() || `${x.name} ${x.category} ${x.tagline}`.toLowerCase().includes(q.trim().toLowerCase())), [ps, q]);
  const totals = useMemo(() => ({
    active: ps?.filter(x => x.active).length || 0, brochures: ps?.reduce((a, x) => a + x.brochures.length, 0) || 0,
    missing: ps?.filter(x => x.active && !x.brochures.some(b => b.active)).length || 0, presented: ps?.reduce((a, x) => a + Number(x.presentations?.presented || 0), 0) || 0,
  }), [ps]);

  async function create() {
    const name = newName.trim(); if (name.length < 2) return;
    const r = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(typeof j.error === "string" ? j.error : "تعذر الإضافة", "error"); return; }
    setNewName(""); await load(); setSel(j.id); setTab("info"); toast("تمت إضافة المنتج — كمّل بياناته وارفع البروشور", "success");
  }
  async function reorder(ids: string[]) {
    setPs(list => list ? ids.map(id => list.find(x => x.id === id)!).filter(Boolean) : list);
    await fetch("/api/admin/products/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
  }
  function dropOn(target: string) {
    if (!ps || !drag || drag === target) return;
    const ids = ps.map(x => x.id).filter(id => id !== drag); ids.splice(ids.indexOf(target), 0, drag); setDrag(null); void reorder(ids);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["منتجات نشطة", totals.active, ""], ["بروشورات مرفوعة", totals.brochures, ""], ["منتجات بدون بروشور", totals.missing, totals.missing ? "text-amber-700" : ""], ["مرات الشرح (90 يوم)", totals.presented, ""]].map(([l, v, c]) =>
          <div key={String(l)} className="rounded-2xl border border-[var(--border)] bg-white p-4"><div className="text-xs text-[var(--muted)]">{l}</div><div className={`text-2xl font-extrabold text-[var(--navy)] mt-1 ${c}`}>{ps ? v : "…"}</div></div>)}
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* List */}
        <div className="rounded-3xl border border-[var(--border)] bg-white p-3 lg:sticky lg:top-4">
          <div className="flex gap-2 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && create()} placeholder="اسم منتج جديد" className="flex-1 min-w-0 rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
            <button onClick={create} disabled={newName.trim().length < 2} className="shrink-0 whitespace-nowrap rounded-xl bg-[var(--navy)] text-white px-3 text-sm font-bold disabled:opacity-40">+ إضافة</button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm mb-2" />
          <div className="text-[11px] text-[var(--muted)] mb-2 px-1">اسحب المنتج لتغيير ترتيبه عند المناديب</div>
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {!ps && [0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-[var(--bg)] animate-pulse" />)}
            {shown.map(x => {
              const warn = x.active && (!x.brochures.some(b => b.active) ? "بدون بروشور" : !lines(x.detailing_points).length ? "بدون نقاط شرح" : "");
              return <div key={x.id} draggable={!q} onDragStart={() => setDrag(x.id)} onDragOver={e => e.preventDefault()} onDrop={() => dropOn(x.id)}
                onClick={() => setSel(x.id)} className={`flex items-center gap-3 rounded-2xl p-2 cursor-pointer border transition ${sel === x.id ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-transparent hover:bg-[var(--bg)]"} ${drag === x.id ? "opacity-40" : ""}`}>
                <span className="text-[var(--muted)] cursor-grab select-none hidden sm:block">⋮⋮</span>
                <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 grid place-items-center text-white text-xs font-extrabold" style={{ background: x.color }}>
                  {x.brochures[0] ? <BrochureCover url={brochureUrl(x.brochures[0].id)} mime={x.brochures[0].mime} className="h-full w-full bg-white" /> : x.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{x.name}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">{x.brochures.length} بروشور · {x.presentations?.presented || 0} شرح</div>
                </div>
                {!x.active ? <span className="rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5">موقوف</span>
                  : warn ? <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5" title={warn}>!</span> : null}
              </div>;
            })}
          </div>
        </div>

        {/* Editor */}
        {p ? <div className="rounded-3xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 justify-between" style={{ borderTop: `5px solid ${p.color}` }}>
            <div className="min-w-0"><div className="text-xs text-[var(--muted)]">{p.category || "منتج"} · آخر تحديث {p.content_updated_at ? ago(p.content_updated_at) : "—"}</div><div className="text-2xl font-extrabold text-[var(--navy)] truncate">{p.name}</div>{p.tagline && <div className="text-sm text-[var(--muted)]">{p.tagline}</div>}</div>
            <div className="flex gap-2">
              <button onClick={() => setPreview({ id: p.id })} className="rounded-xl bg-[var(--navy)] text-white px-4 py-2 text-sm font-bold">▶ معاينة كما يراها المندوب</button>
            </div>
          </div>
          <div className="flex gap-1 px-3 border-b border-[var(--border)] overflow-x-auto">
            {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === k ? "border-[var(--navy)] text-[var(--navy)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}>{l}{k === "brochures" ? ` (${p.brochures.length})` : ""}</button>)}
          </div>
          <div className="p-4 sm:p-5">
            {tab === "info" && <InfoTab key={p.id} p={p} all={ps || []} onSaved={load} onDeleted={() => { setSel(null); void load(); }} />}
            {tab === "brochures" && <BrochuresTab key={p.id} p={p} onChanged={load} onPreview={bid => setPreview({ id: p.id, brochureId: bid })} />}
            {tab === "points" && <PointsTab key={p.id} p={p} onSaved={load} />}
            {tab === "image" && <ImageTab key={p.id} p={p} onChanged={load} />}
            {tab === "stats" && <StatsTab p={p} />}
          </div>
        </div> : <div className="rounded-3xl border border-dashed border-[var(--border-strong)] p-10 text-center text-[var(--muted)]">{ps ? "اختار منتج أو ضيف منتج جديد" : "جاري التحميل…"}</div>}
      </div>

      {preview && ps && <DetailingPresenter admin products={ps} startId={preview.id} startBrochureId={preview.brochureId} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ───────── tabs ─────────
function useSaver(id: string, onSaved: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Record<string, unknown>, msg = "تم الحفظ") => {
    setBusy(true);
    const r = await fetch(`/api/admin/products/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(false);
    if (r.ok) { toast(msg, "success"); onSaved(); return true; }
    const j = await r.json().catch(() => ({})); toast(typeof j.error === "string" ? j.error : "تعذر الحفظ", "error"); return false;
  };
  return { busy, save };
}
const field = "w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--navy-3)]";

function InfoTab({ p, all, onSaved, onDeleted }: { p: SP; all: SP[]; onSaved: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: p.name, tagline: p.tagline, category: p.category, color: p.color, description: p.description });
  const { busy, save } = useSaver(p.id, onSaved);
  const dirty = (Object.keys(f) as Array<keyof typeof f>).some(k => f[k] !== (p as Record<string, unknown>)[k]);
  const cats = [...new Set(all.map(x => x.category).filter(Boolean))];
  async function remove() {
    if (!confirm(`حذف «${p.name}» نهائياً؟`)) return;
    const r = await fetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
    if (r.ok) { toast("تم حذف المنتج", "success"); onDeleted(); } else { const j = await r.json().catch(() => ({})); toast(typeof j.error === "string" ? j.error : "تعذر الحذف", "error"); }
  }
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">اسم المنتج</span><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={field} /></label>
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">الفئة</span><input list="cats" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="مثال: عناية بالشعر" className={field} /><datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist></label>
        </div>
        <label className="block"><span className="text-xs font-bold text-[var(--muted)]">جملة تعريفية قصيرة (بتظهر على الكارت)</span><input value={f.tagline} maxLength={140} onChange={e => setF({ ...f, tagline: e.target.value })} placeholder="مثال: علاج متكامل لتساقط الشعر بنتائج من أول شهر" className={field} /></label>
        <label className="block"><span className="text-xs font-bold text-[var(--muted)]">الوصف</span><textarea rows={5} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={field} /></label>
        <div><span className="text-xs font-bold text-[var(--muted)]">لون المنتج (بيميّزه في العرض والكروت)</span>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">{COLORS.map(c => <button key={c} onClick={() => setF({ ...f, color: c })} className={`h-8 w-8 rounded-full transition ${f.color === c ? "ring-2 ring-offset-2 ring-[var(--navy)] scale-110" : ""}`} style={{ background: c }} aria-label={c} />)}
            <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} className="h-8 w-10 rounded cursor-pointer" title="لون مخصص" /></div></div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button disabled={!dirty || busy || f.name.trim().length < 2} onClick={() => save(f)} className="rounded-xl bg-[var(--navy)] text-white px-5 py-2.5 text-sm font-bold disabled:opacity-40">{busy ? "جاري الحفظ…" : "حفظ التعديلات"}</button>
          {dirty && <button onClick={() => setF({ name: p.name, tagline: p.tagline, category: p.category, color: p.color, description: p.description })} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold">تراجع</button>}
          {dirty && <span className="text-xs text-amber-700">فيه تعديلات مش محفوظة</span>}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <div className="flex items-center justify-between"><div><div className="font-bold">ظاهر للمناديب</div><div className="text-xs text-[var(--muted)]">لو موقوف مش هيظهر في العرض ولا في تسجيل الزيارة</div></div>
            <button onClick={() => save({ active: !p.active }, p.active ? "تم إيقاف المنتج" : "تم تفعيل المنتج")} className={`relative h-7 w-12 rounded-full transition ${p.active ? "bg-emerald-600" : "bg-slate-300"}`} aria-pressed={p.active}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${p.active ? "right-0.5" : "right-[1.375rem]"}`} /></button></div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] p-4 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-[var(--muted)]">مناديب المنتج</span><b>{p.reps_count}</b></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">اتضاف</span><b>{ago(p.created_at)}</b></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">نسخة المحتوى</span><b>{p.detailing_version || "—"}</b></div>
        </div>
        <div className="rounded-2xl border border-red-100 p-4">
          {p.in_use ? <div className="text-xs text-[var(--muted)]">المنتج مستخدم في زيارات أو مربوط بمناديب، فمينفعش يتحذف — تقدر توقفه بدل كده.</div>
            : <button onClick={remove} className="text-sm font-bold text-red-700">حذف المنتج نهائياً</button>}
        </div>
      </div>
    </div>
  );
}

function BrochuresTab({ p, onChanged, onPreview }: { p: SP; onChanged: () => void; onPreview: (bid: string) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [queue, setQueue] = useState<Array<{ name: string; pct: number; error?: string }>>([]);
  const [open, setOpen] = useState<string | null>(null);

  async function addFiles(files: FileList | File[]) {
    const list = [...files];
    for (const f of list) {
      const idx = queue.length + list.indexOf(f);
      setQueue(q => [...q, { name: f.name, pct: 0 }]);
      if (f.size > 19 * 1024 * 1024) { setQueue(q => q.map((x, i) => i === idx ? { ...x, error: "أكبر من 19 ميجا" } : x)); continue; }
      const form = new FormData(); form.append("file", f); form.append("pages", String(await pdfPages(f)));
      const r = await upload(`/api/admin/products/${p.id}/brochures`, "POST", form, pct => setQueue(q => q.map((x, i) => i === idx ? { ...x, pct } : x)));
      setQueue(q => q.map((x, i) => i === idx ? { ...x, pct: 100, error: r.ok ? undefined : r.error } : x));
      if (!r.ok) toast(r.error || "تعذر الرفع", "error");
    }
    onChanged(); setTimeout(() => setQueue(q => q.filter(x => x.error)), 1500);
  }
  async function patch(b: Brochure, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/products/brochures/${b.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) onChanged(); else toast("تعذر الحفظ", "error");
  }
  async function replace(b: Brochure, f: File) {
    const form = new FormData(); form.append("file", f); form.append("pages", String(await pdfPages(f)));
    const r = await upload(`/api/admin/products/brochures/${b.id}`, "PATCH", form, () => {});
    if (r.ok) { toast("تم استبدال الملف", "success"); onChanged(); } else toast(r.error || "تعذر الاستبدال", "error");
  }
  async function remove(b: Brochure) {
    if (!confirm(`حذف «${b.title || b.file_name}»؟`)) return;
    const r = await fetch(`/api/admin/products/brochures/${b.id}`, { method: "DELETE" });
    if (r.ok) { toast("تم الحذف", "success"); onChanged(); } else toast("تعذر الحذف", "error");
  }
  async function move(i: number, d: number) {
    const ids = p.brochures.map(b => b.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await fetch("/api/admin/products/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, productId: p.id }) });
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} className={`cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition ${over ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border-strong)] hover:bg-[var(--bg)]"}`}>
        <div className="text-4xl">📄</div>
        <div className="font-extrabold text-[var(--navy)] mt-2">اسحب البروشورات هنا أو اضغط للاختيار</div>
        <div className="text-xs text-[var(--muted)] mt-1">PDF أو صور (JPG / PNG / WEBP) · حتى 19 ميجا للملف · تقدر ترفع أكتر من ملف مرة واحدة</div>
        <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {queue.length > 0 && <div className="space-y-1.5">{queue.map((x, i) => <div key={i} className="rounded-xl border border-[var(--border)] p-2.5 text-sm"><div className="flex justify-between"><span className="truncate">{x.name}</span><span className={x.error ? "text-red-700" : "text-[var(--muted)]"}>{x.error || `${x.pct}%`}</span></div>{!x.error && <div className="h-1.5 mt-1.5 rounded-full bg-[var(--bg)] overflow-hidden"><div className="h-full bg-[var(--navy)] transition-all" style={{ width: `${x.pct}%` }} /></div>}</div>)}</div>}

      {!p.brochures.length && !queue.length && <div className="text-center text-sm text-[var(--muted)] py-4">لسه مفيش بروشورات للمنتج ده</div>}
      <div className="space-y-3">
        {p.brochures.map((b, i) => (
          <div key={b.id} className={`rounded-2xl border p-3 ${b.active ? "border-[var(--border)]" : "border-dashed border-slate-300 bg-slate-50"}`}>
            <div className="flex gap-3">
              <button onClick={() => onPreview(b.id)} className="h-28 w-20 shrink-0 rounded-lg overflow-hidden border border-[var(--border)] bg-white" title="معاينة"><BrochureCover url={brochureUrl(b.id)} mime={b.mime} className="h-full w-full" /></button>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input defaultValue={b.title} placeholder="عنوان البروشور" onBlur={e => e.target.value.trim() !== b.title && patch(b, { title: e.target.value })} className="w-full rounded-lg border border-transparent hover:border-[var(--border)] focus:border-[var(--navy-3)] px-2 py-1 font-bold outline-none" />
                <div className="text-xs text-[var(--muted)] px-2">{b.mime === "application/pdf" ? `${b.pages} صفحة` : "صورة"} · {kb(b.size_bytes)} · {b.file_name} · {ago(b.updated_at)}</div>
                <div className="flex flex-wrap gap-1.5 px-1 pt-1">
                  <button onClick={() => onPreview(b.id)} className="rounded-lg bg-[var(--navy)] text-white px-3 py-1.5 text-xs font-bold">▶ معاينة</button>
                  {b.mime === "application/pdf" && b.pages > 1 && <button onClick={() => setOpen(open === b.id ? null : b.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold">{open === b.id ? "إخفاء الصفحات" : "عرض الصفحات"}</button>}
                  <label className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold cursor-pointer">استبدال الملف<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void replace(b, f); e.target.value = ""; }} /></label>
                  <a href={brochureUrl(b.id)} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold">تنزيل</a>
                  <button onClick={() => patch(b, { active: !b.active })} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold">{b.active ? "إخفاء عن المناديب" : "إظهار للمناديب"}</button>
                  <button onClick={() => remove(b)} className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-xs font-bold">حذف</button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="h-8 w-8 rounded-lg border border-[var(--border)] disabled:opacity-30" title="لفوق">▲</button>
                <button disabled={i === p.brochures.length - 1} onClick={() => move(i, 1)} className="h-8 w-8 rounded-lg border border-[var(--border)] disabled:opacity-30" title="لتحت">▼</button>
              </div>
            </div>
            {open === b.id && <div className="flex gap-2 overflow-x-auto mt-3 pb-1 bg-[var(--bg)] rounded-xl p-2" dir="ltr">{Array.from({ length: b.pages }, (_, n) => <PageThumb key={n} url={brochureUrl(b.id)} n={n + 1} height={110} onClick={() => onPreview(b.id)} />)}</div>}
            {!b.active && <div className="text-[11px] text-slate-500 mt-2 px-1">مخفي عن المناديب</div>}
          </div>
        ))}
      </div>
      {p.brochures.length > 1 && <div className="text-xs text-[var(--muted)]">أول بروشور ظاهر هو اللي بيفتح تلقائياً عند المندوب، والباقي بيظهروا كتابات فوق العرض.</div>}
    </div>
  );
}

function ListEditor({ label, hint, items, setItems, placeholder }: { label: string; hint: string; items: string[]; setItems: (x: string[]) => void; placeholder: string }) {
  return (
    <div>
      <div className="font-bold">{label}</div><div className="text-xs text-[var(--muted)] mb-2">{hint}</div>
      <div className="space-y-1.5">
        {items.map((x, i) => <div key={i} className="flex gap-1.5 items-start">
          <span className="mt-2.5 h-6 w-6 shrink-0 rounded-md bg-[var(--sky-soft)] text-[var(--navy)] text-xs font-bold grid place-items-center">{i + 1}</span>
          <textarea rows={1} value={x} onChange={e => setItems(items.map((y, j) => j === i ? e.target.value : y))} className={`${field} resize-y`} />
          <div className="flex flex-col"><button disabled={!i} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); }} className="h-5 w-6 text-[10px] disabled:opacity-20">▲</button><button disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setItems(n); }} className="h-5 w-6 text-[10px] disabled:opacity-20">▼</button></div>
          <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="mt-2 h-7 w-7 rounded-lg text-red-700 hover:bg-red-50">✕</button>
        </div>)}
      </div>
      <button onClick={() => setItems([...items, ""])} className="mt-2 rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2 text-sm font-bold text-[var(--navy)] w-full">+ {placeholder}</button>
    </div>
  );
}

function PointsTab({ p, onSaved }: { p: SP; onSaved: () => void }) {
  const [pts, setPts] = useState(lines(p.detailing_points));
  const [qs, setQs] = useState(lines(p.key_questions));
  const [ver, setVer] = useState(p.detailing_version || "1.0");
  const { busy, save } = useSaver(p.id, onSaved);
  const clean = (a: string[]) => a.map(x => x.trim()).filter(Boolean).join("\n");
  const dirty = clean(pts) !== clean(lines(p.detailing_points)) || clean(qs) !== clean(lines(p.key_questions)) || ver !== (p.detailing_version || "1.0");
  const bump = () => { const m = ver.match(/^(\d+)\.(\d+)$/); setVer(m ? `${m[1]}.${Number(m[2]) + 1}` : ver); };
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        <ListEditor label="الرسائل الأساسية" hint="النقط اللي المندوب لازم يقولها — بتظهرله كـ checklist أثناء العرض (الطبيب مش بيشوفها)" items={pts} setItems={setPts} placeholder="إضافة رسالة" />
        <ListEditor label="أسئلة تفتح بيها الكلام" hint="أسئلة يسألها للطبيب عشان يفتح النقاش" items={qs} setItems={setQs} placeholder="إضافة سؤال" />
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="text-xs font-bold text-[var(--muted)]">نسخة المحتوى</span><input value={ver} onChange={e => setVer(e.target.value)} className={`${field} w-28`} /></label>
          <button onClick={bump} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-bold">رفع النسخة</button>
          <button disabled={!dirty || busy} onClick={() => save({ detailing_points: clean(pts), key_questions: clean(qs), detailing_version: ver })} className="rounded-xl bg-[var(--navy)] text-white px-5 py-2.5 text-sm font-bold disabled:opacity-40">{busy ? "جاري الحفظ…" : "حفظ"}</button>
        </div>
      </div>
      <div className="rounded-3xl bg-[#0b1d20] p-3"><div className="text-[11px] text-white/60 mb-2 px-1">كده بتظهر للمندوب</div>
        <div className="rounded-2xl bg-white p-4 text-sm space-y-3" style={{ borderTop: `4px solid ${p.color}` }}>
          <div className="font-extrabold text-[var(--navy)]">{p.name}</div>
          {clean(pts) && <div className="space-y-1.5">{pts.filter(x => x.trim()).map((x, i) => <div key={i} className="flex gap-2 rounded-xl border border-[var(--border)] p-2"><span className="h-5 w-5 shrink-0 rounded-md border border-[var(--border-strong)] grid place-items-center text-xs">{i + 1}</span>{x}</div>)}</div>}
          {clean(qs) && <div className="space-y-1.5">{qs.filter(x => x.trim()).map((x, i) => <div key={i} className="rounded-xl bg-[var(--sky-light)] p-2">❓ {x}</div>)}</div>}
          {!clean(pts) && !clean(qs) && <div className="text-[var(--muted)] text-center py-6">ضيف أول نقطة شرح</div>}
        </div>
      </div>
    </div>
  );
}

function ImageTab({ p, onChanged }: { p: SP; onChanged: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function send(f: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { toast("الصورة لازم تكون JPG أو PNG أو WEBP", "error"); return; }
    const form = new FormData(); form.append("image", f);
    const r = await upload(`/api/admin/products/${p.id}/image`, "POST", form, () => {});
    if (r.ok) { toast("تم رفع الصورة", "success"); setV(x => x + 1); onChanged(); } else toast(r.error || "تعذر الرفع", "error");
  }
  async function remove() { if (!confirm("حذف صورة المنتج؟")) return; const r = await fetch(`/api/admin/products/${p.id}/image`, { method: "DELETE" }); if (r.ok) { onChanged(); toast("تم الحذف", "success"); } }
  return (
    <div className="grid sm:grid-cols-2 gap-6 items-start">
      <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void send(f); }} onClick={() => input.current?.click()}
        className={`cursor-pointer aspect-square rounded-3xl border-2 border-dashed grid place-items-center overflow-hidden ${over ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border-strong)] hover:bg-[var(--bg)]"}`}>
        {p.image_available ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/admin/products/${p.id}/image?v=${v}-${p.content_updated_at}`} alt="" className="h-full w-full object-contain" />
          : <div className="text-center p-6"><div className="text-4xl">🖼️</div><div className="font-bold text-[var(--navy)] mt-2">اسحب صورة المنتج هنا</div><div className="text-xs text-[var(--muted)]">JPG / PNG / WEBP</div></div>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />
      </div>
      <div className="space-y-3 text-sm">
        <div className="font-bold">صورة المنتج</div>
        <p className="text-[var(--muted)] leading-6">بتظهر في شريط المنتجات أثناء العرض، وفي كروت تسجيل الزيارة، وكغلاف للمنتج لو مفيهوش بروشور. الأفضل صورة مربعة بخلفية بيضا.</p>
        <div className="flex gap-2"><button onClick={() => input.current?.click()} className="rounded-xl bg-[var(--navy)] text-white px-4 py-2 font-bold">{p.image_available ? "تغيير الصورة" : "رفع صورة"}</button>{p.image_available && <button onClick={remove} className="rounded-xl border border-red-200 text-red-700 px-4 py-2 font-bold">حذف</button>}</div>
      </div>
    </div>
  );
}

function StatsTab({ p }: { p: SP }) {
  const s = p.presentations || ({} as Stats); const t = Number(s.presented || 0);
  const pc = (n: number) => t ? Math.round((Number(n) / t) * 100) : 0;
  const card = (l: string, v: string | number, sub = "") => <div className="rounded-2xl bg-[var(--bg)] p-4"><div className="text-xs text-[var(--muted)]">{l}</div><div className="text-2xl font-extrabold text-[var(--navy)] mt-1">{v}</div>{sub && <div className="text-[11px] text-[var(--muted)]">{sub}</div>}</div>;
  const mins = Math.round(Number(p.detailing?.seconds || 0) / 60);
  return (
    <div className="space-y-5">
      <div className="text-xs text-[var(--muted)]">آخر 90 يوم</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {card("مرات الشرح", t, s.last ? `آخر مرة ${ago(s.last)}` : "")}
        {card("أطباء اتشرحلهم", s.doctors || 0, `${s.reps || 0} مندوب`)}
        {card("العينات / الأوردرات", `${p.items?.samples || 0} / ${p.items?.orders || 0}`, "قطع")}
        {card("عروض البروشور", p.detailing?.sessions || 0, `${mins} دقيقة عرض`)}
      </div>
      <div><div className="font-bold mb-2">ردود فعل الأطباء</div>
        {t ? <><div className="flex h-4 rounded-full overflow-hidden bg-[var(--bg)]"><i className="bg-emerald-600" style={{ width: `${pc(s.interested)}%` }} /><i className="bg-slate-300" style={{ width: `${pc(s.neutral)}%` }} /><i className="bg-red-500" style={{ width: `${pc(s.not_interested)}%` }} /></div>
          <div className="flex gap-4 text-sm mt-2"><span>👍 مهتم {pc(s.interested)}%</span><span>😐 محايد {pc(s.neutral)}%</span><span>👎 غير مهتم {pc(s.not_interested)}%</span></div></>
          : <div className="text-sm text-[var(--muted)]">لسه مفيش شرح متسجل للمنتج ده</div>}
      </div>
      {p.top_pages.length > 0 && <div><div className="font-bold mb-2">أكتر صفحات البروشور اللي المناديب بيقفوا عندها</div>
        <div className="flex gap-3 overflow-x-auto pb-1">{p.top_pages.map((x, i) => x.brochure_id && <div key={i} className="shrink-0 text-center"><div dir="ltr"><PageThumb url={brochureUrl(x.brochure_id)} n={x.page} height={130} /></div><div className="text-xs mt-1"><b>صفحة {x.page}</b> · {Math.round(x.seconds / 60) || "<1"} د</div></div>)}</div></div>}
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/reports?type=repProduct&productId=${p.id}`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold">تقرير المندوب × المنتج</Link>
        <Link href={`/admin/reports?type=products&productId=${p.id}&from=${new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10)}`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold">تقرير المنتج</Link>
      </div>
    </div>
  );
}
