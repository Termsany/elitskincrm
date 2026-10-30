"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadPdf, pageBitmap } from "./pdf";

/** One brochure page, fitted to the stage. Swipe / arrows / double-tap zoom. */
export default function BrochureViewer({ url, mime, page, onPage, onPages, dark = true }: {
  url: string; mime: string; page: number; onPage: (n: number) => void; onPages?: (n: number) => void; dark?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [pages, setPages] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [dir, setDir] = useState(0);
  const isPdf = mime === "application/pdf";

  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let dead = false; setZoom(1);
    if (!isPdf) { setDoc(null); setPages(1); onPages?.(1); setState("ready"); return; }
    setState("loading");
    loadPdf(url).then(d => { if (dead) return; setDoc(d); setPages(d.numPages); onPages?.(d.numPages); }).catch(() => !dead && setState("error"));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isPdf]);

  const [bmp, setBmp] = useState<{ c: HTMLCanvasElement; i: number } | null>(null);
  useLayoutEffect(() => {
    const c = canvas.current; if (!c || !bmp) return;
    c.width = bmp.c.width; c.height = bmp.c.height; c.style.width = bmp.c.style.width; c.style.height = bmp.c.style.height;
    c.getContext("2d")!.drawImage(bmp.c, 0, 0);
  }, [bmp]);
  useEffect(() => {
    if (!doc || !size.w || !size.h) return;
    let dead = false; const n = Math.min(page, doc.numPages), W = size.w - 16, H = size.h - 16;
    pageBitmap(url, doc, n, W, H, zoom).then(src => {
      if (dead) return;
      setBmp(b => ({ c: src, i: (b?.i || 0) + 1 })); setState("ready");
      // pre-render neighbours in the background
      if (zoom === 1) { if (n < doc.numPages) pageBitmap(url, doc, n + 1, W, H).catch(() => {}); if (n > 1) pageBitmap(url, doc, n - 1, W, H).catch(() => {}); }
    }).catch((e: any) => { if (!dead && e?.name !== "RenderingCancelledException") setState("error"); });
    return () => { dead = true; };
  }, [doc, url, page, size.w, size.h, zoom]);

  const go = (n: number) => { if (n < 1 || n > pages || n === page) return; setDir(n > page ? 1 : -1); setZoom(1); onPage(n); };

  // swipe + double tap
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);
  function onPointerDown(e: React.PointerEvent) { start.current = { x: e.clientX, y: e.clientY, t: Date.now() }; }
  function onPointerUp(e: React.PointerEvent) {
    const s = start.current; start.current = null; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - s.t < 800) { go(dx < 0 ? page + 1 : page - 1); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) { setZoom(z => (z === 1 ? 2 : 1)); lastTap.current = 0; } else lastTap.current = now;
    }
  }

  const btn = `absolute top-1/2 -translate-y-1/2 z-10 h-14 w-14 rounded-full grid place-items-center text-2xl font-bold transition disabled:opacity-0 ${dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-black/5 text-[var(--navy)] hover:bg-black/10"}`;
  return (
    <div className="relative h-full w-full select-none" dir="ltr">
      <div ref={stage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
        className={`absolute inset-0 ${zoom > 1 ? "overflow-auto cursor-grab" : "overflow-hidden grid place-items-center"}`} style={{ touchAction: zoom > 1 ? "pan-x pan-y" : "pan-y" }}>
        {isPdf
          ? <canvas key={bmp?.i || 0} ref={canvas} className={`${zoom > 1 ? "m-2" : ""} rounded-md shadow-2xl ${dir > 0 ? "animate-[slideL_.22s_ease-out]" : dir < 0 ? "animate-[slideR_.22s_ease-out]" : "animate-[fadeIn_.2s_ease-out]"}`} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="" draggable={false} className="max-h-full max-w-full rounded-md shadow-2xl object-contain" style={zoom > 1 ? { maxHeight: "none", maxWidth: "none", width: "200%" } : undefined} onLoad={() => setState("ready")} onError={() => setState("error")} />}
      </div>
      {state === "loading" && <div className="absolute inset-0 grid place-items-center pointer-events-none"><div className={`h-10 w-10 rounded-full border-4 ${dark ? "border-white/20 border-t-white" : "border-black/10 border-t-[var(--navy)]"} animate-spin`} /></div>}
      {state === "error" && <div className={`absolute inset-0 grid place-items-center text-sm ${dark ? "text-white/80" : "text-red-700"}`}>تعذر فتح البروشور — تأكد من الاتصال أو جهّز المنتجات للعمل بدون إنترنت</div>}
      {pages > 1 && <>
        <button aria-label="الصفحة السابقة" onClick={() => go(page - 1)} disabled={page <= 1} className={`${btn} left-2`}>‹</button>
        <button aria-label="الصفحة التالية" onClick={() => go(page + 1)} disabled={page >= pages} className={`${btn} right-2`}>›</button>
      </>}
      {zoom > 1 && <button onClick={() => setZoom(1)} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 text-white text-xs px-3 py-1.5">رجوع للحجم الطبيعي</button>}
      <style>{`@keyframes slideL{from{opacity:.3;transform:translateX(40px)}to{opacity:1;transform:none}}@keyframes slideR{from{opacity:.3;transform:translateX(-40px)}to{opacity:1;transform:none}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

/** Lazy page thumbnail (renders when scrolled into view). */
export function PageThumb({ url, n, height = 96, active, onClick }: { url: string; n: number; height?: number; active?: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || !ref.current) return; let task: any = null, dead = false;
    loadPdf(url).then(d => d.getPage(n)).then((p: any) => {
      if (dead || !ref.current) return;
      const base = p.getViewport({ scale: 1 }); const s = (height * 2) / base.height; const vp = p.getViewport({ scale: s });
      ref.current.width = vp.width; ref.current.height = vp.height; ref.current.style.height = `${height}px`; ref.current.style.width = `${(vp.width / vp.height) * height}px`;
      task = p.render({ canvasContext: ref.current.getContext("2d")!, viewport: vp, canvas: ref.current });
    }).catch(() => {});
    return () => { dead = true; task?.cancel?.(); };
  }, [seen, url, n, height]);
  return (
    <button ref={box} onClick={onClick} className={`relative shrink-0 rounded-md overflow-hidden bg-white/90 transition ${active ? "ring-2 ring-[var(--sky)] scale-105" : "opacity-70 hover:opacity-100"}`} style={{ height, minWidth: height * 0.7 }}>
      <canvas ref={ref} className="block" />
      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 text-white text-[10px] px-1">{n}</span>
    </button>
  );
}

/** First page as a cover image for cards. */
export function BrochureCover({ url, mime, className = "" }: { url: string; mime: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (mime !== "application/pdf") return; const el = box.current; if (!el) return;
    let task: any = null, dead = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      loadPdf(url).then(d => d.getPage(1)).then((p: any) => {
        if (dead || !ref.current) return;
        const base = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: 520 / base.width });
        ref.current.width = vp.width; ref.current.height = vp.height;
        task = p.render({ canvasContext: ref.current.getContext("2d")!, viewport: vp, canvas: ref.current });
        return task.promise;
      }).then(() => !dead && setOk(true)).catch(() => {});
    }, { rootMargin: "300px" });
    io.observe(el); return () => { dead = true; io.disconnect(); task?.cancel?.(); };
  }, [url, mime]);
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {mime !== "application/pdf" ? <img src={url} alt="" className="h-full w-full object-cover" /> :
        <canvas ref={ref} className={`h-full w-full object-cover object-top transition-opacity duration-500 ${ok ? "opacity-100" : "opacity-0"}`} />}
    </div>
  );
}
