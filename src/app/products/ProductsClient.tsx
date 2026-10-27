"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { OFFLINE_PRODUCT_CACHE, offlineProductCacheKey, offlineProductSummary, productBrochureUrl } from "@/lib/offline-product-kit";
import { ProductPresenter } from "@/components/ProductPresenter";

type P = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  reps_count: number;
  usage_count: number;
  description: string;
  detailing_points: string;
  key_questions: string;
  detailing_version: string;
  content_updated_at: string;
  brochure_name: string | null;
  brochure_mime: string | null;
  brochure_available: boolean;
  image_available: boolean;
};
const API = "/api/products";
export default function ProductsClient() {
  const [ps, setPs] = useState<P[]>([]),
    [sel, setSel] = useState<P | null>(null),
    [search, setSearch] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [offlineState, setOfflineState] = useState<"unknown" | "ready" | "missing" | "downloading" | "error">("unknown"),
    [offlineMessage, setOfflineMessage] = useState("");
  async function load() {
    try {
      const r = await fetch(API, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setPs(j.products || []);
    } catch {
      try {
        const cache = await caches.open(OFFLINE_PRODUCT_CACHE);
        const r = await cache.match(API);
        if (!r) throw new Error();
        const j = await r.json();
        setPs(j.products || []);
        setOfflineMessage("أنت بدون اتصال — يتم عرض آخر نسخة محفوظة على الجهاز");
      } catch {
        setPs([]);
        setOfflineMessage("افتح الصفحة أثناء الاتصال أولًا لتجهيز المنتجات للعمل بدون إنترنت.");
      }
    }
  }
  useEffect(() => {
    void load();
    if (localStorage.getItem("elite-offline-products-ready")) setOfflineState("ready");
  }, []);
  async function prepareOffline() {
    setOfflineState("downloading");
    setOfflineMessage("");
    try {
      const cache = await caches.open(OFFLINE_PRODUCT_CACHE);
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const copy = response.clone();
      const data = (await response.json()) as { products: P[] };
      await cache.put(API, copy);
      const summary = offlineProductSummary(data.products);
      let cached = 0;
      for (const product of data.products) {
        await cache.put(
          offlineProductCacheKey(product.id),
          new Response(JSON.stringify(product), { headers: { "content-type": "application/json" } }),
        );
        if (product.brochure_available) {
          const brochure = await fetch(productBrochureUrl(product.id), { cache: "no-store" });
          if (!brochure.ok) throw new Error(`تعذر تنزيل بروشور ${product.name}`);
          await cache.put(productBrochureUrl(product.id), brochure.clone());
          cached++;
        }
      }
      const page = await fetch("/products", { cache: "no-store" });
      if (page.ok) await cache.put("/products", page.clone());
      localStorage.setItem(
        "elite-offline-products-ready",
        JSON.stringify({ at: new Date().toISOString(), ...summary, cachedBrochures: cached }),
      );
      setPs(data.products);
      setOfflineState("ready");
      setOfflineMessage(`تم تجهيز ${summary.products} منتج و${cached} بروشور للعمل بدون إنترنت.`);
    } catch (e) {
      setOfflineState("error");
      setOfflineMessage(e instanceof Error ? e.message : "تعذر تجهيز المنتجات للعمل بدون إنترنت");
    }
  }
  function openProduct(product: P) {
    setSel(product);
  }
  const visible = useMemo(
    () =>
      ps.filter(
        (p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || "").toLowerCase().includes(search.toLowerCase()),
      ),
    [ps, search],
  );
  function toggleFavorite(id: string) {
    setFavorites((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  return (
    <div className="mt-5" dir="rtl">
      <section className="mb-5 overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm">
        <div className="p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div className="max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--navy)] px-3 py-1 text-[11px] font-extrabold text-white">e-DETAILING</span>
              {offlineState === "ready" && <Badge tone="success">جاهز بدون إنترنت</Badge>}
            </div>
            <h2 className="text-lg font-extrabold text-[var(--navy)] sm:text-xl">اعرض المنتج للطبيب بسهولة</h2>
            <p className="mt-1 text-sm leading-6 text-sky-950/75">
              اختر المنتج لعرض التفاصيل والبروشور بوضوح، ثم افتح العرض حتى لو انقطع الإنترنت بعد تجهيز المحتوى على الجهاز.
            </p>
          </div>
          <button
            type="button"
            disabled={offlineState === "downloading"}
            onClick={() => void prepareOffline()}
            className="mt-4 min-h-12 w-full rounded-2xl bg-[var(--navy)] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50 lg:mt-0 lg:w-auto lg:min-w-56"
          >
            {offlineState === "downloading"
              ? "جارٍ تجهيز المنتجات…"
              : offlineState === "ready"
                ? "تحديث المحتوى المحفوظ"
                : "تجهيز للعمل بدون إنترنت"}
          </button>
        </div>
        {offlineMessage && (
          <div role="status" className="border-t border-sky-200/70 px-4 py-3 text-xs font-semibold leading-5 text-sky-950 sm:px-5">
            {offlineMessage}
          </div>
        )}
      </section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المنتج أو وصفه"
          className="min-h-12 flex-1 rounded-2xl border bg-white px-4 text-sm outline-none focus:border-[var(--gold)]"
        />
        <div className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-[var(--muted)]">{visible.length} منتج متاح</div>
      </div>
      {!visible.length ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-[var(--muted)]">لا توجد منتجات متاحة حاليًا.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {visible.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => openProduct(p)}
              aria-label={`فتح تفاصيل ${p.name}`}
              className="group min-h-52 text-right"
            >
              <Card className="flex h-full flex-col p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--gold)] group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-[var(--gold)] sm:p-5">
                <div className="mb-3 flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50">
                  {p.image_available ? (
                    <img src={`/api/products/${p.id}/image`} alt={`صورة ${p.name}`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sky-600">
                      <Icon name="products" size={52} strokeWidth={1.5} />
                    </span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-extrabold text-[var(--navy)] sm:text-xl">{p.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="success">فعال</Badge>
                      {p.brochure_available && <Badge tone="info">بروشور جاهز</Badge>}
                      {offlineState === "ready" && <Badge tone="success">محفوظ للجوال</Badge>}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="تفضيل المنتج"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(p.id);
                    }}
                    className="inline-flex"
                  >
                    {favorites.includes(p.id) ? (
                      <Icon name="star" size={24} fill="currentColor" className="text-amber-500" />
                    ) : (
                      <Icon name="star" size={24} className="text-slate-300" />
                    )}
                  </button>
                </div>
                <p className="mt-4 line-clamp-4 flex-1 text-sm leading-6 text-[var(--muted)]">
                  {p.description || "اضغط لفتح العرض التعريفي للمنتج"}
                </p>
                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs font-bold text-[var(--navy)]">
                  <span>فتح e-Detailing</span>
                  <span aria-hidden="true">←</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <ProductPresenter
          product={sel}
          onClose={() => setSel(null)}
          footer={
            <Link
              href={`/visits/new?productId=${encodeURIComponent(sel.id)}`}
              className="block min-h-12 w-full rounded-2xl bg-[var(--gold)] px-4 py-3 text-center text-sm font-extrabold text-[var(--navy)] shadow-sm"
            >
              تسجيل زيارة بهذا المنتج
            </Link>
          }
        />
      )}
    </div>
  );
}
