"use client";
import { useEffect, useRef, useState } from "react";
import { pdfjs } from "@/components/detailing/pdf";

export type LFile = { src: string; id: string; name: string; mime: string; size: number | string | null; created_at: string; owner_id: string | null; owner_name: string | null; folder: string; description: string; visibility: string; signed: boolean; source_kind: string | null; source_id: string | null; ctx: string; ctx_url: string | null };
export type Asset = { id: string; kind: "signature" | "stamp"; name: string; mime_type: string; is_default: boolean };

export const L = "ar-EG-u-nu-latn";
export const shortName = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, "");
export const fileUrl = (f: { src: string; id: string }, dl = false) => `/api/library/file/${f.src}/${f.id}${dl ? "?dl=1" : ""}`;
export const assetUrl = (id: string) => `/api/library/assets/${id}`;
export const canSign = (mime: string) => ["application/pdf", "image/png", "image/jpeg"].includes(mime);
export function fmtSize(b: number | string | null) { const n = Number(b || 0); if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`; return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`; }
export const fmtDate = (d: string, withTime = false) => new Date(d).toLocaleString(L, withTime ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });

export function typeMeta(mime: string, name = "") {
  const ext = (name.split(".").pop() || "").toUpperCase();
  if (mime === "application/pdf") return { label: "PDF", tone: "bg-red-50 text-red-600 border-red-100", bar: "bg-red-500" };
  if (mime.startsWith("image/")) return { label: ext && ext.length <= 4 ? ext : "IMG", tone: "bg-violet-50 text-violet-600 border-violet-100", bar: "bg-violet-500" };
  if (mime.includes("word")) return { label: "DOC", tone: "bg-blue-50 text-blue-600 border-blue-100", bar: "bg-blue-500" };
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return { label: mime === "text/csv" ? "CSV" : "XLS", tone: "bg-emerald-50 text-emerald-700 border-emerald-100", bar: "bg-emerald-500" };
  if (mime.includes("presentation") || mime.includes("powerpoint")) return { label: "PPT", tone: "bg-orange-50 text-orange-600 border-orange-100", bar: "bg-orange-500" };
  return { label: ext.slice(0, 4) || "FILE", tone: "bg-slate-50 text-slate-600 border-slate-200", bar: "bg-slate-400" };
}

export const SRC_META: Record<string, { label: string; icon: string }> = {
  lib: { label: "المكتبة", icon: "📁" }, brochure: { label: "بروشورات المنتجات", icon: "📘" }, visit: { label: "مرفقات الزيارات", icon: "🩺" },
  task: { label: "مرفقات المهام", icon: "✅" }, request: { label: "مرفقات الطلبات", icon: "📨" }, request_signed: { label: "طلبات موقعة", icon: "🖋️" },
};

/** First-page preview, rendered only when the card scrolls into view (pdf.js doc is destroyed right after). */
export function Thumb({ f, className = "" }: { f: LFile; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const meta = typeMeta(f.mime, f.name);
  const isImg = ["image/png", "image/jpeg", "image/webp"].includes(f.mime);
  const isPdf = f.mime === "application/pdf" && Number(f.size || 0) < 12 * 1048576;
  useEffect(() => {
    if (!isPdf || !ref.current) return;
    let dead = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      try {
        const m = await pdfjs(); const doc = await m.getDocument({ url: fileUrl(f), withCredentials: true }).promise;
        const page = await doc.getPage(1); const base = page.getViewport({ scale: 1 });
        const box = ref.current?.getBoundingClientRect(); const w = (box?.width || 220) * 1.6;
        const vp = page.getViewport({ scale: w / base.width });
        const c = canvas.current; if (!c || dead) { doc.destroy(); return; }
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
        doc.destroy(); if (!dead) setState("ok");
      } catch { if (!dead) setState("fail"); }
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => { dead = true; io.disconnect(); };
  }, [f.src, f.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={`relative overflow-hidden bg-[var(--bg)] ${className}`}>
    {isImg ? <img src={fileUrl(f)} alt="" loading="lazy" className="h-full w-full object-cover" />
      : isPdf ? <canvas ref={canvas} className={`h-full w-full object-cover object-top transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`} /> : null}
    {(!isImg && (!isPdf || state !== "ok")) && <div className="absolute inset-0 flex items-center justify-center"><span className={`rounded-xl border px-3 py-2 text-sm font-extrabold ${meta.tone} ${isPdf && state === "idle" ? "animate-pulse" : ""}`}>{meta.label}</span></div>}
  </div>;
}

/** Draw-your-signature pad: smooth strokes, auto-trimmed transparent PNG. */
export function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string, name: string) => Promise<void>; onCancel: () => void }) {
  const c = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState("#0b2545"); const [empty, setEmpty] = useState(true); const [name, setName] = useState("توقيعي"); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const cv = c.current!; const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr; const ctx = cv.getContext("2d")!; ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = c.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); c.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return; const p = pos(e); const ctx = c.current!.getContext("2d")!;
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6 + p.p * 2.2; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y);
    const mx = (last.current.x + p.x) / 2, my = (last.current.y + p.y) / 2; ctx.quadraticCurveTo(last.current.x, last.current.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setEmpty(false);
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => { const cv = c.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setEmpty(true); };
  const trimmed = () => {
    const cv = c.current!; const ctx = cv.getContext("2d")!; const { width: W, height: H } = cv; const d = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const pad = 12; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
    const out = document.createElement("canvas"); out.width = x1 - x0; out.height = y1 - y0; out.getContext("2d")!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };
  return <div className="space-y-3">
    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[var(--sky-border)] bg-white">
      <canvas ref={c} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="block h-[220px] w-full touch-none cursor-crosshair" />
      <div className="pointer-events-none absolute inset-x-6 bottom-12 border-b border-slate-300" />
      {empty && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">ارسم توقيعك هنا بالماوس أو بإصبعك ✍️</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-[var(--muted)]">لون الحبر</span>
      {["#0b2545", "#111827", "#1d4ed8"].map(x => <button key={x} type="button" onClick={() => setInk(x)} className={`h-7 w-7 rounded-full border-2 ${ink === x ? "border-[var(--sky)] ring-2 ring-[var(--sky)]/30" : "border-white"}`} style={{ background: x }} aria-label="ink" />)}
      <button type="button" onClick={clear} className="mr-auto rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-bold">مسح</button>
    </div>
    <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم التوقيع" className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm" />
    <div className="flex gap-2"><button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold">إلغاء</button>
      <button type="button" disabled={empty || busy} onClick={async () => { setBusy(true); try { await onSave(trimmed(), name); } finally { setBusy(false); } }} className="flex-1 rounded-xl bg-[var(--navy)] py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "جاري الحفظ…" : "احفظ التوقيع"}</button></div>
  </div>;
}
