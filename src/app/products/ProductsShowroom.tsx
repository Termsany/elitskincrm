"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DetailingPresenter from "@/components/detailing/DetailingPresenter";
import { BrochureCover } from "@/components/detailing/BrochureViewer";
import { brochureUrl } from "@/components/detailing/pdf";
import { REACTIONS, imageUrl, type DetailProduct, type PresenterResult } from "@/components/detailing/types";

type Doctor = { id: string; name: string; clinic_name: string | null; city: string | null };
const CACHE = "elite-product-detailing-v1";
const FAV = "elite-fav-products";

export default function ProductsShowroom({ doctors, canVisit }: { doctors: Doctor[]; canVisit: boolean }) {
  const router = useRouter();
  const [products, setProducts] = useState<DetailProduct[] | null>(null);
  const [offline, setOffline] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [fav, setFav] = useState<string[]>([]);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [dq, setDq] = useState(""); const [dOpen, setDOpen] = useState(false);
  const [present, setPresent] = useState<{ id: string } | null>(null);
  const [result, setResult] = useState<PresenterResult | null>(null);
  const [prep, setPrep] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [prepMsg, setPrepMsg] = useState("");

  useEffect(() => {
    try { setFav(JSON.parse(localStorage.getItem(FAV) || "[]")); if (localStorage.getItem("elite-offline-products-ready")) setPrep("done"); } catch { /* ignore */ }
    fetch("/api/products/catalog", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setProducts(j.products))
      .catch(async () => {
        try { const c = await caches.open(CACHE); const r = await c.match("/api/products/catalog"); if (!r) throw 0; setProducts((await r.json()).products); setOffline("أنت بدون إنترنت — بيتعرض آخر نسخة محفوظة على الجهاز"); }
        catch { setProducts([]); setOffline("مفيش اتصال ومفيش نسخة محفوظة — افتح الصفحة مرة وإنت متصل ودوس «تجهيز بدون إنترنت»"); }
      });
  }, []);

  const toggleFav = (id: string) => setFav(f => { const n = f.includes(id) ? f.filter(x => x !== id) : [id, ...f]; try { localStorage.setItem(FAV, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const cats = useMemo(() => [...new Set((products || []).map(p => p.category).filter(Boolean))], [products]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = (products || []).filter(p => (!cat || p.category === cat) && (!t || `${p.name} ${p.tagline} ${p.category} ${p.description}`.toLowerCase().includes(t)));
    return [...xs.filter(p => fav.includes(p.id)), ...xs.filter(p => !fav.includes(p.id))];
  }, [products, q, cat, fav]);
  const ordered = useMemo(() => [...(products || [])].sort((a, b) => Number(fav.includes(b.id)) - Number(fav.includes(a.id))), [products, fav]);
  const docs = useMemo(() => { const t = dq.trim().toLowerCase(); return (t ? doctors.filter(d => `${d.name} ${d.clinic_name || ""} ${d.city || ""}`.toLowerCase().includes(t)) : doctors).slice(0, 30); }, [dq, doctors]);

  async function prepareOffline() {
    if (!products) return; setPrep("busy"); setPrepMsg("");
    try {
      const c = await caches.open(CACHE);
      const urls = ["/products", "/api/products/catalog", ...products.flatMap(p => [...p.brochures.map(b => brochureUrl(b.id)), ...(p.image_available ? [imageUrl(p.id)] : [])])];
      let i = 0;
      for (const u of urls) { const r = await fetch(u, { cache: "no-store" }); if (r.ok) await c.put(u, r.clone()); setPrepMsg(`${++i} / ${urls.length}`); }
      localStorage.setItem("elite-offline-products-ready", new Date().toISOString()); setPrep("done"); setPrepMsg("");
    } catch { setPrep("error"); setPrepMsg("التحميل وقف — جرّب تاني وإنت على واي فاي"); }
  }

  function closed(r: PresenterResult) {
    setPresent(null);
    if (canVisit && (doctor || Object.keys(r.reactions).length)) setResult(r);
  }
  function goVisit() {
    if (!result) return;
    const prods = result.shown.map(id => `${id}:${result.reactions[id] || "neutral"}`).join(",");
    const qs = new URLSearchParams(); if (doctor) qs.set("doctorId", doctor.id); if (prods) qs.set("products", prods);
    router.push(`/visits/new?${qs}`);
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--navy)] text-white p-5 sm:p-6">
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/5" /><div className="absolute left-24 -bottom-20 h-48 w-48 rounded-full bg-[var(--sky)]/20" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-white/70 text-sm">وضع العرض للطبيب</div>
            <div className="text-2xl font-extrabold mt-1">اختار المنتج وابدأ الشرح</div>
            <div className="text-white/70 text-sm mt-1">قلّب صفحات البروشور بالسحب، وبدّل بين المنتجات من فوق في أي وقت.</div>
          </div>
          {/* doctor picker */}
          <div className="relative w-full sm:w-80">
            <div className="text-xs text-white/70 mb-1">العرض لمين؟ (اختياري — بيتسجل مع الزيارة)</div>
            {doctor ? <div className="flex items-center justify-between rounded-2xl bg-white text-[var(--ink)] px-3 py-2.5"><div className="min-w-0"><div className="font-bold truncate">{doctor.name}</div><div className="text-xs text-[var(--muted)] truncate">{[doctor.clinic_name, doctor.city].filter(Boolean).join(" · ")}</div></div><button onClick={() => setDoctor(null)} className="text-[var(--muted)] px-2">✕</button></div>
              : <input value={dq} onChange={e => { setDq(e.target.value); setDOpen(true); }} onFocus={() => setDOpen(true)} onBlur={() => setTimeout(() => setDOpen(false), 150)} placeholder="ابحث باسم الطبيب أو العيادة" className="w-full rounded-2xl bg-white text-[var(--ink)] px-3 py-2.5 text-sm outline-none" />}
            {dOpen && !doctor && <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-2xl bg-white text-[var(--ink)] shadow-xl border border-[var(--border)]">
              {docs.map(d => <button key={d.id} onMouseDown={() => { setDoctor(d); setDq(""); setDOpen(false); }} className="block w-full text-right px-3 py-2 hover:bg-[var(--bg)]"><div className="font-bold text-sm">{d.name}</div><div className="text-xs text-[var(--muted)]">{[d.clinic_name, d.city].filter(Boolean).join(" · ")}</div></button>)}
              {!docs.length && <div className="p-3 text-sm text-[var(--muted)]">لا نتائج</div>}
            </div>}
          </div>
        </div>
      </div>

      {/* Tools */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث عن منتج" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm w-full sm:w-64" />
        {cats.length > 0 && <div className="flex gap-1.5 overflow-x-auto">{["", ...cats].map(c => <button key={c || "all"} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border ${cat === c ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{c || "الكل"}</button>)}</div>}
        <button onClick={prepareOffline} disabled={prep === "busy" || !products?.length} className={`mr-auto rounded-xl border px-3 py-2 text-xs font-bold ${prep === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[var(--border)] bg-white"}`}>
          {prep === "busy" ? `جاري التجهيز… ${prepMsg}` : prep === "done" ? "✓ جاهز بدون إنترنت — تحديث" : "⬇ تجهيز للعمل بدون إنترنت"}
        </button>
      </div>
      {(offline || (prep === "error" && prepMsg)) && <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-3 py-2">{offline || prepMsg}</div>}

      {/* Grid */}
      {!products && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map(i => <div key={i} className="h-80 rounded-3xl bg-white animate-pulse" />)}</div>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map(p => {
          const b = p.brochures[0]; const pages = p.brochures.reduce((a, x) => a + (x.pages || 1), 0);
          return (
            <div key={p.id} className="group relative rounded-3xl bg-white border border-[var(--border)] overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition">
              <button onClick={() => setPresent({ id: p.id })} className="block w-full text-right">
                <div className="relative h-56" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` }}>
                  {b ? <BrochureCover url={brochureUrl(b.id)} mime={b.mime} className="absolute inset-3 rounded-2xl bg-white shadow-lg" />
                    : p.image_available ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={imageUrl(p.id)} alt="" className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-2xl bg-white object-contain" />
                    : <div className="absolute inset-0 grid place-items-center text-4xl font-extrabold text-white/90">{p.name}</div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent opacity-0 group-hover:opacity-100 transition grid place-items-end p-4"><span className="rounded-full bg-white text-[var(--navy)] px-4 py-2 text-sm font-extrabold shadow">▶ ابدأ العرض</span></div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} /><div className="font-extrabold text-lg text-[var(--navy)]">{p.name}</div>{p.category && <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">{p.category}</span>}</div>
                  <div className="text-sm text-[var(--muted)] mt-1 line-clamp-2 min-h-[2.5rem]">{p.tagline || p.description || "—"}</div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-[var(--muted)]">
                    <span>📄 {p.brochures.length ? `${pages} صفحة` : "بدون بروشور"}</span>
                    {p.brochures.length > 1 && <span>{p.brochures.length} بروشور</span>}
                    {p.detailing_points && <span>📝 نقاط شرح</span>}
                  </div>
                </div>
              </button>
              <button onClick={() => toggleFav(p.id)} title="تثبيت في الأول" className={`absolute top-3 left-3 h-9 w-9 rounded-full grid place-items-center text-lg shadow ${fav.includes(p.id) ? "bg-amber-400 text-white" : "bg-white/90 text-slate-400 hover:text-amber-500"}`}>★</button>
            </div>
          );
        })}
      </div>
      {products && !list.length && <div className="rounded-3xl bg-white border border-[var(--border)] p-10 text-center text-[var(--muted)]">لا توجد منتجات مطابقة</div>}

      {present && products && <DetailingPresenter products={ordered} startId={present.id} doctor={doctor} onClose={closed} />}

      {/* After presenting: one tap to log the visit with what was shown */}
      {result && <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => setResult(null)}>
        <div dir="rtl" className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
          <div className="font-extrabold text-lg text-[var(--navy)]">تسجّل الزيارة دلوقتي؟</div>
          <div className="text-sm text-[var(--muted)] mt-1">{doctor ? `مع ${doctor.name} · ` : ""}عرضت {result.shown.length} منتج في {Math.max(1, Math.round(result.seconds / 60))} دقيقة</div>
          <div className="mt-3 space-y-1.5">{result.shown.map(id => { const p = products?.find(x => x.id === id); const r = REACTIONS.find(x => x[0] === result.reactions[id]); return p && <div key={id} className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-3 py-2 text-sm"><span className="font-bold">{p.name}</span><span className="text-[var(--muted)]">{r ? `${r[2]} ${r[1]}` : "بدون رد فعل"}</span></div>; })}</div>
          <div className="flex gap-2 mt-4"><button onClick={goVisit} className="flex-1 rounded-xl bg-[var(--navy)] text-white py-3 font-bold">تسجيل الزيارة بالبيانات دي</button><button onClick={() => setResult(null)} className="rounded-xl border border-[var(--border)] px-4 font-bold">لاحقاً</button></div>
        </div>
      </div>}
    </div>
  );
}
