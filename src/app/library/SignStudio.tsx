"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { pdfjs, renderPage } from "@/components/detailing/pdf";
import { useToast } from "@/components/Toast";
import { SignaturePad, assetUrl, fileUrl, type Asset, type LFile } from "./ui";

type Pl = { key: string; asset_id: string; page: number; x: number; y: number; w: number; h: number; allPages: boolean };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function AssetsManager({ assets, canStamp, reload, compact }: { assets: Asset[]; canStamp: boolean; reload: () => Promise<void>; compact?: boolean }) {
  const toast = useToast();
  const [pad, setPad] = useState(false);
  const upload = async (kind: "signature" | "stamp", file: File) => {
    const f = new FormData(); f.set("kind", kind); f.set("name", kind === "stamp" ? "ختم الشركة" : "توقيع"); f.set("file", file);
    const r = await fetch("/api/library/assets", { method: "POST", body: f }); const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "فشل الرفع", "error"); return; } toast("اتحفظ ✓", "success"); await reload();
  };
  const del = async (a: Asset) => { if (!confirm(`حذف "${a.name}"؟`)) return; await fetch(`/api/library/assets/${a.id}`, { method: "DELETE" }); await reload(); };
  const def = async (a: Asset) => { await fetch(`/api/library/assets/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_default: true }) }); await reload(); };
  const group = (kind: "signature" | "stamp") => assets.filter(a => a.kind === kind);
  return <div className="space-y-4">
    {pad ? <SignaturePad onCancel={() => setPad(false)} onSave={async (dataUrl, name) => {
      const r = await fetch("/api/library/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "signature", name, dataUrl }) });
      const j = await r.json().catch(() => null); if (!r.ok) { toast(j?.error || "فشل الحفظ", "error"); return; }
      toast("اتحفظ توقيعك ✓", "success"); setPad(false); await reload();
    }} /> : <>
      {(["signature", ...(canStamp ? ["stamp"] : [])] as Array<"signature" | "stamp">).map(kind => <div key={kind}>
        <div className="mb-2 flex items-center justify-between"><div className="text-sm font-extrabold text-[var(--navy)]">{kind === "stamp" ? "أختام الشركة" : "توقيعاتي"}</div>
          <div className="flex gap-1.5">{kind === "signature" && <button type="button" onClick={() => setPad(true)} className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-xs font-bold text-white">✍️ ارسم</button>}
            <label className="cursor-pointer rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-bold">⬆ ارفع صورة<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(kind, f); e.target.value = ""; }} /></label></div></div>
        <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          {group(kind).map(a => <div key={a.id} className={`group relative rounded-xl border bg-white p-2 ${a.is_default ? "border-[var(--sky)]" : "border-[var(--border)]"}`}>
            <div className="flex h-16 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px]"><img src={assetUrl(a.id)} alt={a.name} className="max-h-14 max-w-full object-contain" /></div>
            <div className="mt-1 flex items-center gap-1"><span className="min-w-0 flex-1 truncate text-[11px] font-bold">{a.name}</span>{a.is_default ? <span className="rounded bg-[var(--sky-light)] px-1 text-[9px] font-bold text-[var(--navy)]">افتراضي</span> : <button type="button" onClick={() => void def(a)} className="text-[9px] font-bold text-[var(--muted)] hover:text-[var(--navy)]">اجعله افتراضي</button>}<button type="button" onClick={() => void del(a)} className="text-xs text-red-500" aria-label="حذف">×</button></div>
          </div>)}
          {!group(kind).length && <div className="col-span-full rounded-xl border border-dashed p-4 text-center text-xs text-[var(--muted)]">{kind === "stamp" ? "ارفع صورة الختم (PNG بخلفية شفافة أفضل)" : "لسه مفيش توقيع — ارسمه في ثواني"}</div>}
        </div>
      </div>)}
      {!canStamp && <div className="rounded-xl bg-[var(--bg)] p-3 text-[11px] text-[var(--muted)]">الختم الرسمي للشركة متاح للإدارة فقط.</div>}
    </>}
  </div>;
}

export default function SignStudio({ file, onClose, onDone, requestId, requestNote }: { file: LFile; onClose: () => void; onDone: (id: string) => void; requestId?: string; requestNote?: string }) {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]); const [canStamp, setCanStamp] = useState(false);
  const [ratio, setRatio] = useState<Record<string, number>>({});
  const [doc, setDoc] = useState<any>(null); const [pages, setPages] = useState(1); const [n, setN] = useState(1);
  const [err, setErr] = useState(""); const [pls, setPls] = useState<Pl[]>([]); const [sel, setSel] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); const [footer, setFooter] = useState(true); const [team, setTeam] = useState(false);
  const [saving, setSaving] = useState(false); const [done, setDone] = useState<{ id: string; ref: string; name: string } | null>(null);
  const [manage, setManage] = useState(false); const [size, setSize] = useState({ w: 0, h: 0 });
  const task = useRef<any>(null);
  const stage = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const sheet = useRef<HTMLDivElement>(null);
  const isImg = file.mime !== "application/pdf";
  const [imgNat, setImgNat] = useState<{ w: number; h: number } | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 900); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const loadAssets = useCallback(async () => {
    const j = await fetch("/api/library/assets", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (!j) return; setAssets(j.assets || []); setCanStamp(!!j.canStamp);
    for (const a of (j.assets || []) as Asset[]) { const im = new Image(); im.onload = () => setRatio(r => ({ ...r, [a.id]: im.naturalHeight / im.naturalWidth })); im.src = assetUrl(a.id); }
  }, []);
  useEffect(() => { void loadAssets(); }, [loadAssets]);
  useEffect(() => {
    if (isImg) { const im = new Image(); im.onload = () => setImgNat({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => setErr("تعذر فتح الصورة"); im.src = fileUrl(file); return; }
    let d: any = null; let dead = false;
    pdfjs().then(m => m.getDocument({ url: fileUrl(file), withCredentials: true }).promise).then(x => { d = x; if (dead) { x.destroy(); return; } setDoc(x); setPages(x.numPages); }).catch(() => setErr("تعذر فتح الملف — ممكن يكون PDF تالف أو محمي بكلمة سر"));
    return () => { dead = true; d?.destroy?.(); };
  }, [file.src, file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  // Fit the page into the stage.
  useLayoutEffect(() => {
    const el = stage.current; if (!el) return;
    const draw = async () => {
      const W = el.clientWidth - 32, H = el.clientHeight - 32; if (W < 50 || H < 50) return;
      if (isImg) { if (!imgNat) return; const s = Math.min(W / imgNat.w, H / imgNat.h, narrow ? 10 : 1.6); setSize({ w: imgNat.w * s, h: imgNat.h * s }); return; }
      if (!doc || !canvas.current) return;
      try { task.current?.cancel?.(); } catch { /* ignore */ }
      const t = await renderPage(doc, n, canvas.current, W, narrow ? 99999 : H); task.current = t;
      try { await t.promise; } catch { return; }
      setSize({ w: parseFloat(canvas.current.style.width), h: parseFloat(canvas.current.style.height) });
    };
    void draw();
    const ro = new ResizeObserver(() => void draw()); ro.observe(el); return () => ro.disconnect();
  }, [doc, n, imgNat, narrow, isImg]);

  const addAt = (assetId: string, cx?: number, cy?: number) => {
    const a = assets.find(x => x.id === assetId); if (!a || !size.w) return;
    const w = a.kind === "stamp" ? 0.2 : 0.28; const h = clamp(w * (ratio[assetId] || 0.4) * (size.w / size.h), 0.02, 0.5);
    const x = cx !== undefined ? clamp(cx - w / 2, 0, 1 - w) : a.kind === "stamp" ? 0.62 : 0.08;
    const y = cy !== undefined ? clamp(cy - h / 2, 0, 1 - h) : clamp(0.86 - h, 0, 1 - h);
    const key = crypto.randomUUID(); setPls(p => [...p, { key, asset_id: assetId, page: n, x, y, w, h, allPages: false }]); setSel(key); setArmed(null);
  };
  const pickAsset = (id: string) => { if (armed === id) { addAt(id); return; } setArmed(id); };
  const onSheetClick = (e: React.MouseEvent) => {
    if (!armed || !sheet.current) { setSel(null); return; }
    const r = sheet.current.getBoundingClientRect(); addAt(armed, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const drag = (e: React.PointerEvent, p: Pl, mode: "move" | "size") => {
    e.stopPropagation(); e.preventDefault(); setSel(p.key);
    const r = sheet.current!.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; const o = { ...p }; const k = o.h / o.w;
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      setPls(list => list.map(q => q.key !== p.key ? q : mode === "move" ? { ...q, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) }
        : (() => { const w = clamp(o.w + dx, 0.05, 1 - o.x); const h = w * k; return h > 1 - o.y ? q : { ...q, w, h }; })()));
    };
    const end = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", end);
  };
  const visible = pls.filter(p => p.page === n || p.allPages);
  const save = async () => {
    if (!pls.length) { toast("ضيف توقيع أو ختم على الصفحة الأول", "error"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/library/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ src: file.src, id: file.id, footer, visibility: team ? "team" : "private", request_id: requestId, placements: pls.map(({ key: _k, ...p }) => p) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { toast(j?.error || "فشل التوقيع", "error"); return; }
      setDone({ id: j.id, ref: j.ref, name: j.name }); onDone(j.id);
    } catch { toast("تعذر الاتصال بالخادم", "error"); } finally { setSaving(false); }
  };

  const assetBar = <div className={narrow ? "flex gap-2 overflow-x-auto pb-1" : "space-y-2"}>
    {assets.map(a => <button key={a.id} type="button" onClick={() => pickAsset(a.id)} className={`shrink-0 rounded-xl border-2 bg-white p-2 text-right transition ${armed === a.id ? "border-[var(--sky)] ring-4 ring-[var(--sky)]/20" : "border-[var(--border)] hover:border-[var(--sky-border)]"} ${narrow ? "w-28" : "w-full"}`}>
      <div className="flex h-12 items-center justify-center"><img src={assetUrl(a.id)} alt="" className="max-h-12 max-w-full object-contain" /></div>
      <div className="mt-1 flex items-center gap-1 text-[11px] font-bold"><span>{a.kind === "stamp" ? "🔵" : "✍️"}</span><span className="truncate">{a.name}</span></div>
    </button>)}
    {!assets.length && <div className={`rounded-xl border border-dashed border-white/30 p-3 text-center text-xs ${narrow ? "w-full text-white/80" : "text-[var(--muted)]"}`}>محتاج توقيع الأول ← اضغط «توقيعاتي»</div>}
  </div>;

  return <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900" dir="rtl">
    <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950 px-3 py-2.5 text-white">
      <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg" aria-label="إغلاق">×</button>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold" dir="auto">{file.name}</div><div className="hidden text-[11px] text-white/50 sm:block">{requestId ? `طلب توقيع${requestNote ? ` — «${requestNote.slice(0, 60)}»` : ""}` : "توقيع وختم"} · {pls.length} علامة</div></div>
      {!isImg && pages > 1 && <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 text-sm"><button onClick={() => setN(x => Math.max(1, x - 1))} disabled={n <= 1} className="h-8 w-8 rounded-lg disabled:opacity-30">›</button><span className="min-w-[64px] text-center font-bold">{n} / {pages}</span><button onClick={() => setN(x => Math.min(pages, x + 1))} disabled={n >= pages} className="h-8 w-8 rounded-lg disabled:opacity-30">‹</button></div>}
      {!done && <button onClick={() => void save()} disabled={saving || !pls.length} className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-40">{saving ? "جاري…" : "✓ حفظ النسخة الموقعة"}</button>}
    </div>
    <div className="flex min-h-0 flex-1">
      <div ref={stage} className={`relative min-w-0 flex-1 ${narrow ? "overflow-auto" : "overflow-hidden"} flex items-start justify-center p-4`} onClick={() => setSel(null)}>
        {err ? <div className="m-auto rounded-2xl bg-white p-6 text-center text-sm text-red-700">{err}</div> : <div ref={sheet} onClick={e => { e.stopPropagation(); onSheetClick(e); }} className={`relative bg-white shadow-2xl ${armed ? "cursor-copy" : ""}`} style={{ width: size.w || undefined, height: size.h || undefined }}>
          {isImg ? <img src={fileUrl(file)} alt="" className="h-full w-full select-none" draggable={false} /> : <canvas ref={canvas} className="block" />}
          {visible.map(p => { const a = assets.find(x => x.id === p.asset_id); const on = sel === p.key; return <div key={p.key} onPointerDown={e => drag(e, p, "move")} onClick={e => e.stopPropagation()} className={`absolute cursor-move touch-none select-none ${on ? "outline outline-2 outline-[var(--sky)]" : "outline outline-1 outline-dashed outline-sky-400/60"}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` }}>
            <img src={assetUrl(p.asset_id)} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
            {on && <>
              <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-900 px-1.5 py-1 text-[11px] font-bold text-white shadow-lg" onPointerDown={e => e.stopPropagation()}>
                {a?.kind === "stamp" && pages > 1 && <button onClick={() => setPls(l => l.map(q => q.key === p.key ? { ...q, allPages: !q.allPages } : q))} className={`rounded px-1.5 py-0.5 ${p.allPages ? "bg-emerald-500" : "bg-white/15"}`}>{p.allPages ? "✓ كل الصفحات" : "كل الصفحات"}</button>}
                <button onClick={() => { setPls(l => l.filter(q => q.key !== p.key)); setSel(null); }} className="rounded bg-red-500 px-1.5 py-0.5">حذف</button>
              </div>
              <div onPointerDown={e => drag(e, p, "size")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-[var(--sky)] shadow" />
            </>}
          </div>; })}
        </div>}
        {armed && !done && <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"><div className="rounded-full bg-[var(--sky)] px-4 py-2 text-xs font-bold text-white shadow-lg">اضغط على المكان اللي عايز تحط فيه التوقيع في الصفحة</div></div>}
      </div>
      {!narrow && <aside className="w-80 shrink-0 space-y-4 overflow-auto border-r border-white/10 bg-[var(--bg)] p-4">
        <div className="flex rounded-xl bg-white p-1 text-sm font-bold"><button onClick={() => setManage(false)} className={`flex-1 rounded-lg py-2 ${!manage ? "bg-[var(--navy)] text-white" : "text-[var(--muted)]"}`}>ضع على المستند</button><button onClick={() => setManage(true)} className={`flex-1 rounded-lg py-2 ${manage ? "bg-[var(--navy)] text-white" : "text-[var(--muted)]"}`}>توقيعاتي</button></div>
        {manage ? <AssetsManager assets={assets} canStamp={canStamp} reload={loadAssets} compact /> : <>
          <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[var(--muted)]"><b className="text-[var(--navy)]">1.</b> اختار توقيع أو ختم &nbsp; <b className="text-[var(--navy)]">2.</b> اضغط مكانه في الصفحة &nbsp; <b className="text-[var(--navy)]">3.</b> اسحبه وكبّره من النقطة الزرقا</div>
          {assetBar}
        </>}
        <div className="space-y-2 rounded-xl bg-white p-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={footer} onChange={e => setFooter(e.target.checked)} className="accent-[var(--navy)]" /><span>سطر توثيق صغير (التاريخ + رقم مرجعي)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={team} onChange={e => setTeam(e.target.checked)} className="accent-[var(--navy)]" /><span>متاح لكل الفريق في المكتبة</span></label>
          <div className="text-[11px] text-[var(--muted)]">الأصل مش هيتغير — هيتحفظ نسخة موقعة جديدة في «المستندات الموقعة».</div>
        </div>
      </aside>}
    </div>
    {narrow && !done && <div className="space-y-2 border-t border-white/10 bg-slate-950 p-3">
      <div className="flex items-center justify-between"><span className="text-xs font-bold text-white/70">اختار توقيع ثم اضغط مكانه</span><button onClick={() => setManage(true)} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white">توقيعاتي</button></div>
      {assetBar}
      <label className="flex items-center gap-2 text-xs text-white/80"><input type="checkbox" checked={footer} onChange={e => setFooter(e.target.checked)} />سطر توثيق</label>
    </div>}
    {narrow && manage && <div className="fixed inset-0 z-[80] flex items-end bg-black/50" onClick={() => setManage(false)}><div onClick={e => e.stopPropagation()} className="max-h-[85vh] w-full overflow-auto rounded-t-3xl bg-[var(--bg)] p-4"><div className="mb-3 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">توقيعاتي وأختامي</div><button onClick={() => setManage(false)} className="h-8 w-8 rounded-full border">×</button></div><AssetsManager assets={assets} canStamp={canStamp} reload={loadAssets} compact /></div></div>}
    {done && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
      <div className="mt-3 text-lg font-extrabold text-[var(--navy)]">اتوقّع المستند بنجاح</div>
      <div className="mt-1 text-sm text-[var(--muted)]" dir="auto">{done.name}</div>
      <div className="mt-2 inline-block rounded-full bg-[var(--bg)] px-3 py-1 font-mono text-xs">Ref {done.ref}</div>
      {requestId && <div className="mt-2 text-xs font-bold text-emerald-700">✓ اتبعتت النسخة الموقعة للمندوب صاحب الطلب</div>}
      <div className="mt-5 grid grid-cols-2 gap-2"><a href={fileUrl({ src: "lib", id: done.id }, true)} className="rounded-xl bg-[var(--navy)] py-2.5 text-sm font-bold text-white">⬇ تنزيل</a><button onClick={onClose} className="rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold">رجوع للمكتبة</button></div>
    </div></div>}
  </div>;
}
