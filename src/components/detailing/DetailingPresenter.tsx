"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrochureViewer, { PageThumb } from "./BrochureViewer";
import { brochureUrl } from "./pdf";
import { REACTIONS, imageUrl, lines, type DetailProduct, type PresenterResult, type Reaction } from "./types";

type Pos = { brochureId: string | null; page: number };

/**
 * Full-screen detailing mode: brochure pages, instant product switching, rep-only notes,
 * doctor reaction capture and time-per-page tracking.
 */
export default function DetailingPresenter({ products, startId, startBrochureId, doctor, initialReactions = {}, admin = false, onClose }: {
  products: DetailProduct[]; startId: string; startBrochureId?: string; doctor?: { id: string; name: string } | null;
  initialReactions?: Record<string, Reaction>; admin?: boolean; onClose: (r: PresenterResult) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pid, setPid] = useState(startId);
  const [pos, setPos] = useState<Record<string, Pos>>(() => startBrochureId ? { [startId]: { brochureId: startBrochureId, page: 1 } } : {});
  const [pages, setPages] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [reactions, setReactions] = useState<Record<string, Reaction>>(initialReactions);
  const [covered, setCovered] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<string[]>([startId]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(new Date().toISOString());
  const track = useRef(new Map<string, { productId: string; brochureId: string | null; page: number; seconds: number }>());

  const product = products.find(p => p.id === pid) || products[0];
  const brochures = product?.brochures || [];
  const cur: Pos = pos[pid] || { brochureId: brochures[0]?.id || null, page: 1 };
  const brochure = brochures.find(b => b.id === cur.brochureId) || brochures[0] || null;
  const total = brochure ? (pages[brochure.id] || brochure.pages || 1) : 1;
  const accent = product?.color || "#10484f";

  const setPage = useCallback((n: number) => setPos(p => ({ ...p, [pid]: { brochureId: brochure?.id || null, page: n } })), [pid, brochure?.id]);
  const switchProduct = (id: string) => { setPid(id); setShown(s => s.includes(id) ? s : [...s, id]); setThumbs(false); };
  const switchBrochure = (bid: string) => setPos(p => ({ ...p, [pid]: { brochureId: bid, page: 1 } }));

  // time tracking (only while visible)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setElapsed(e => e + 1);
      if (!product) return;
      const k = `${product.id}|${brochure?.id || ""}|${brochure ? cur.page : 0}`;
      const v = track.current.get(k) || { productId: product.id, brochureId: brochure?.id || null, page: brochure ? cur.page : 0, seconds: 0 };
      v.seconds++; track.current.set(k, v);
    }, 1000);
    return () => clearInterval(t);
  }, [product, brochure, cur.page]);

  const finish = useCallback(() => {
    if (!admin) {
      const views = [...track.current.values()].map(v => ({ ...v, page: Math.max(1, v.page) }));
      const body = JSON.stringify({ doctorId: doctor?.id, startedAt: startedAt.current, endedAt: new Date().toISOString(), views, reactions });
      try { if (!navigator.sendBeacon?.("/api/detailing", new Blob([body], { type: "application/json" }))) fetch("/api/detailing", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }); } catch { /* best effort */ }
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose({ reactions, shown, seconds: elapsed });
  }, [admin, doctor?.id, reactions, shown, elapsed, onClose]);

  // keyboard + body lock
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); if (cur.page < total) setPage(cur.page + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); if (cur.page > 1) setPage(cur.page - 1); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = products.findIndex(p => p.id === pid); const n = products[(i + (e.key === "ArrowDown" ? 1 : -1) + products.length) % products.length];
        if (n) switchProduct(n.id);
      }
      if (e.key === "Escape") { if (notes) setNotes(false); else if (thumbs) setThumbs(false); else finish(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.page, total, pid, notes, thumbs, finish, setPage]);

  const fullscreen = () => {
    const el = root.current as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el?.webkitRequestFullscreen?.();
  };

  const points = useMemo(() => lines(product?.detailing_points || ""), [product?.detailing_points]);
  const questions = useMemo(() => lines(product?.key_questions || ""), [product?.key_questions]);
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  if (!product) return null;

  return (
    <div ref={root} dir="rtl" className="fixed inset-0 z-[60] flex flex-col bg-[#0b1d20] text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Top: product switcher */}
      <div className={`shrink-0 transition-all duration-300 ${chrome ? "opacity-100" : "opacity-0 pointer-events-none -translate-y-2"}`}>
        <div className="flex items-center gap-2 px-3 pt-3">
          <button onClick={finish} className="h-10 rounded-xl bg-white/10 hover:bg-white/20 px-3 text-sm font-bold whitespace-nowrap">✕ {admin ? "إغلاق المعاينة" : "إنهاء العرض"}</button>
          <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto no-scrollbar py-1">
            {products.map(p => {
              const on = p.id === pid, seen = shown.includes(p.id), r = reactions[p.id];
              return <button key={p.id} onClick={() => switchProduct(p.id)}
                className={`group flex items-center gap-2 shrink-0 rounded-2xl pl-3 pr-1.5 py-1.5 text-sm font-bold transition border ${on ? "bg-white text-[#0b1d20] border-white" : "bg-white/5 border-white/10 hover:bg-white/15"}`}>
                <span className="h-8 w-8 rounded-xl overflow-hidden grid place-items-center text-xs font-extrabold text-white shrink-0" style={{ background: p.color }}>
                  {p.image_available ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl(p.id, admin)} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 2)}
                </span>
                <span className="whitespace-nowrap">{p.name}</span>
                {r ? <span className="text-xs">{REACTIONS.find(x => x[0] === r)?.[2]}</span> : seen && !on ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--sky)]" /> : null}
              </button>;
            })}
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-white/70 tabular-nums" title="مدة العرض">⏱ {mm}</div>
          <button onClick={fullscreen} className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 hidden sm:grid place-items-center" title="ملء الشاشة">⛶</button>
        </div>
        {brochures.length > 1 && <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto no-scrollbar">
          {brochures.map(b => <button key={b.id} onClick={() => switchBrochure(b.id)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold border ${b.id === brochure?.id ? "border-white bg-white/15" : "border-white/15 text-white/70 hover:text-white"}`}>{b.title || b.file_name}</button>)}
        </div>}
      </div>

      {/* Stage */}
      <div className="relative flex-1 min-h-0" onDoubleClick={e => e.stopPropagation()}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        {brochure
          ? <BrochureViewer url={brochureUrl(brochure.id)} mime={brochure.mime} page={cur.page} onPage={setPage} onPages={n => setPages(p => ({ ...p, [brochure.id]: n }))} />
          : <NoBrochure p={product} admin={admin} />}
        <button onClick={() => setChrome(c => !c)} className="absolute bottom-2 left-2 z-10 hidden sm:block rounded-full bg-black/40 text-white/70 text-[11px] px-3 py-1 hover:text-white" title="إخفاء/إظهار الأزرار">{chrome ? "وضع العرض النظيف" : "إظهار الأزرار"}</button>
      </div>

      {/* Thumbnails */}
      {thumbs && brochure?.mime === "application/pdf" && <div className="shrink-0 flex gap-2 overflow-x-auto px-3 py-2 bg-black/30" dir="ltr">
        {Array.from({ length: total }, (_, i) => <PageThumb key={i} url={brochureUrl(brochure.id)} n={i + 1} height={84} active={cur.page === i + 1} onClick={() => setPage(i + 1)} />)}
      </div>}

      {/* Bottom bar */}
      <div className={`relative z-30 bg-[#0b1d20] shrink-0 flex flex-wrap items-center gap-2 px-3 py-2.5 transition-all duration-300 ${chrome ? "opacity-100" : "opacity-0 pointer-events-none translate-y-2"}`}>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setNotes(n => !n)} className={`h-10 rounded-xl px-3 text-sm font-bold ${notes ? "bg-white text-[#0b1d20]" : "bg-white/10 hover:bg-white/20"}`}>📝 نقاط الشرح</button>
          {brochure?.mime === "application/pdf" && total > 1 && <button onClick={() => setThumbs(t => !t)} className={`h-10 rounded-xl px-3 text-sm font-bold ${thumbs ? "bg-white text-[#0b1d20]" : "bg-white/10 hover:bg-white/20"}`}>▦ الصفحات</button>}
        </div>
        {brochure && total > 1 && <div className="flex items-center gap-2 mx-auto" dir="ltr">
          <div className="text-sm tabular-nums font-bold">{cur.page} / {total}</div>
          <div className="hidden sm:block w-40 h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(cur.page / total) * 100}%`, background: accent === "#10484f" ? "var(--sky)" : accent }} /></div>
        </div>}
        <div className="flex items-center gap-1 mr-auto">
          <span className="text-xs text-white/60 ml-1 hidden sm:inline">رد فعل الطبيب:</span>
          {REACTIONS.map(([k, label, icon]) => <button key={k} onClick={() => setReactions(r => ({ ...r, [pid]: k }))} title={label}
            className={`h-10 rounded-xl px-2.5 text-sm font-bold transition ${reactions[pid] === k ? "bg-white text-[#0b1d20]" : "bg-white/10 hover:bg-white/20"}`}>{icon}<span className="hidden md:inline mr-1">{label}</span></button>)}
        </div>
      </div>

      {/* Rep notes drawer (doctor sees only the brochure) */}
      <div className={`absolute top-0 bottom-0 right-0 z-20 w-[min(380px,90vw)] bg-white text-[var(--ink)] shadow-2xl transition-transform duration-300 flex flex-col ${notes ? "translate-x-0" : "translate-x-full"}`}>
        <div className="p-4 border-b border-[var(--border)] flex items-start justify-between gap-2" style={{ borderTop: `4px solid ${accent}` }}>
          <div><div className="text-xs text-[var(--muted)]">نقاط الشرح — للمندوب</div><div className="font-extrabold text-lg text-[var(--navy)]">{product.name}</div>{product.tagline && <div className="text-sm text-[var(--muted)]">{product.tagline}</div>}</div>
          <button onClick={() => setNotes(false)} className="h-9 w-9 rounded-xl border border-[var(--border)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {product.description && <p className="leading-7 text-[var(--ink-soft)]">{product.description}</p>}
          {points.length > 0 && <div><div className="font-bold mb-2">الرسائل الأساسية</div>
            <div className="space-y-1.5">{points.map((x, i) => { const k = `${pid}-${i}`; return <button key={k} onClick={() => setCovered(c => ({ ...c, [k]: !c[k] }))} className={`w-full text-right flex gap-2 rounded-xl border p-2.5 transition ${covered[k] ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-[var(--border)] hover:bg-[var(--bg)]"}`}><span className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border grid place-items-center text-xs ${covered[k] ? "bg-emerald-600 border-emerald-600 text-white" : "border-[var(--border-strong)]"}`}>{covered[k] ? "✓" : i + 1}</span><span className="leading-6">{x}</span></button>; })}</div></div>}
          {questions.length > 0 && <div><div className="font-bold mb-2">أسئلة تفتح بيها الكلام</div><ul className="space-y-1.5">{questions.map((q, i) => <li key={i} className="rounded-xl bg-[var(--sky-light)] p-2.5 leading-6">❓ {q}</li>)}</ul></div>}
          {!points.length && !questions.length && !product.description && <div className="text-[var(--muted)] text-center py-8">لسه مفيش نقاط شرح للمنتج ده — بتتضاف من لوحة المنتجات عند الأدمن</div>}
          {product.detailing_version && <div className="text-[11px] text-[var(--muted)]">نسخة المحتوى {product.detailing_version}</div>}
        </div>
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`}</style>
    </div>
  );
}

function NoBrochure({ p, admin }: { p: DetailProduct; admin: boolean }) {
  return (
    <div className="h-full grid place-items-center p-6">
      <div className="max-w-xl w-full rounded-3xl bg-white text-[var(--ink)] overflow-hidden shadow-2xl">
        <div className="h-48 grid place-items-center text-5xl font-extrabold text-white" style={{ background: p.color }}>
          {p.image_available ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl(p.id, admin)} alt="" className="h-full w-full object-contain bg-white" /> : p.name}
        </div>
        <div className="p-6 space-y-2">
          <div className="text-2xl font-extrabold text-[var(--navy)]">{p.name}</div>
          {p.tagline && <div className="text-[var(--muted)]">{p.tagline}</div>}
          {p.description && <p className="leading-7">{p.description}</p>}
          <ul className="space-y-1 text-sm">{lines(p.detailing_points).map((x, i) => <li key={i}>• {x}</li>)}</ul>
          <div className="text-xs text-[var(--muted)] pt-2">لا يوجد بروشور مرفوع لهذا المنتج بعد</div>
        </div>
      </div>
    </div>
  );
}
