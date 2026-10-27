"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { productBrochureUrl } from "@/lib/offline-product-kit";

// Product shape needed to present e-Detailing content. Shared by the products
// page and the visit flow so the viewer stays identical in both places.
export type PresenterProduct = {
  id: string;
  name: string;
  description?: string | null;
  detailing_points?: string | null;
  key_questions?: string | null;
  detailing_version?: string | null;
  content_updated_at?: string | null;
  brochure_available?: boolean;
  brochure_mime?: string | null;
  image_available?: boolean;
};

// Split admin-entered content into lines. Handles real newlines (from the
// textarea) and legacy literal "\n" sequences, and drops list bullets.
function splitLines(text: string): string[] {
  return text
    .split(/\\n|\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

// Full-screen e-Detailing viewer: product image, brochure (PDF with page nav or
// image), summary, key points and conversation questions. `footer` lets each
// caller add its own primary action (register a visit, return to the visit…).
export function ProductPresenter({
  product,
  onClose,
  footer,
}: {
  product: PresenterProduct;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [pdfPage, setPdfPage] = useState(1);
  const isPdf = product.brochure_mime === "application/pdf";
  const points = splitLines(product.detailing_points || "");
  const questions = splitLines(product.key_questions || "");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4">
      <div className="flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-3xl" role="dialog" aria-modal="true" aria-label={`عرض ${product.name}`}>
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold text-[var(--navy)] sm:text-lg">{product.name}</div>
            <div className="mt-0.5 text-[11px] text-[var(--muted)]">عرض المنتج للطبيب</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isPdf && (
              <>
                <button type="button" disabled={pdfPage <= 1} onClick={() => setPdfPage((n) => Math.max(1, n - 1))} className="min-h-11 rounded-xl border px-3 text-xs font-extrabold disabled:opacity-40 sm:px-4 sm:text-sm">السابق</button>
                <span className="hidden min-w-16 text-center text-xs font-bold sm:inline">صفحة {pdfPage}</span>
                <button type="button" onClick={() => setPdfPage((n) => n + 1)} className="min-h-11 rounded-xl border px-3 text-xs font-extrabold sm:px-4 sm:text-sm">التالي</button>
              </>
            )}
            <button type="button" aria-label="إغلاق العرض" onClick={onClose} className="flex min-h-11 items-center justify-center rounded-xl border px-3"><Icon name="x" size={18} /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-100">
          {product.image_available && (
            <div className="bg-white p-4 sm:p-6">
              <img src={`/api/products/${product.id}/image`} alt={`صورة ${product.name}`} className="mx-auto max-h-64 w-full rounded-2xl object-contain" />
            </div>
          )}
          <div className="h-[58vh] min-h-72 sm:h-[68vh] lg:h-[72vh]">
            {product.brochure_available ? (
              isPdf ? (
                <iframe title={`بروشور ${product.name}`} src={`${productBrochureUrl(product.id)}#page=${pdfPage}&view=FitH&toolbar=0&navpanes=0`} className="h-full w-full border-0" />
              ) : (
                <div className="flex h-full w-full items-center justify-center overflow-auto p-3 sm:p-6">
                  <img src={productBrochureUrl(product.id)} alt={`بروشور ${product.name}`} className="max-h-full max-w-full rounded-xl object-contain shadow-sm" />
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--muted)]">لا يوجد بروشور لهذا المنتج حاليًا. يمكنك عرض التفاصيل وتسجيل الزيارة.</div>
            )}
          </div>
          <div className="border-t bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold text-[var(--navy)]">ملخص العرض</h3>
              <span className="text-[11px] font-semibold text-[var(--muted)]">إصدار {product.detailing_version || "1.0"}{product.content_updated_at ? ` · ${new Date(product.content_updated_at).toLocaleDateString("ar-SA")}` : ""}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{product.description || "لا توجد تفاصيل إضافية مضافة لهذا المنتج."}</p>
            {points.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-extrabold text-[var(--navy)]">نقاط العرض الأساسية</div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--muted)]">
                  {points.map((point, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]" /><span>{point}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {questions.length > 0 && (
              <div className="mt-4 rounded-2xl bg-sky-50 p-3">
                <div className="text-sm font-extrabold text-sky-950">أسئلة لفتح الحوار</div>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-sky-950/80">
                  {questions.map((question, i) => (
                    <li key={i}>• {question}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {footer && <footer className="shrink-0 border-t bg-white p-3 sm:p-4">{footer}</footer>}
      </div>
    </div>
  );
}
