"use client";
// Shared pdf.js loader + document cache (switching between brochures is instant after first open).
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfJs> | null = null;
const docs = new Map<string, Promise<any>>();

export function pdfjs(): Promise<PdfJs> {
  if (!lib) lib = import("pdfjs-dist/legacy/build/pdf.mjs").then(m => { m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; return m; });
  return lib;
}
export function loadPdf(url: string): Promise<any> {
  let p = docs.get(url);
  if (!p) {
    p = pdfjs().then(m => m.getDocument({ url, withCredentials: true }).promise);
    p.catch(() => docs.delete(url));
    docs.set(url, p);
  }
  return p;
}
export const brochureUrl = (id: string, admin = false) => `/api/products/brochures/${id}${admin ? "?admin=1" : ""}`;

/** Render one page into a canvas so it fits (contain) inside w×h CSS pixels. */
export async function renderPage(doc: any, n: number, canvas: HTMLCanvasElement, w: number, h: number, zoom = 1) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(w / base.width, h / base.height) * zoom;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, zoom > 1 ? 2 : 2.5);
  const vp = page.getViewport({ scale: fit * dpr });
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`; canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  const task = page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas });
  return task;
}

// Offscreen page bitmaps so turning a page swaps instantly (no white flash) and the next page is pre-rendered.
const bitmaps = new Map<string, Promise<HTMLCanvasElement>>();
export function pageBitmap(url: string, doc: any, n: number, w: number, h: number, zoom = 1): Promise<HTMLCanvasElement> {
  const k = `${url}|${n}|${w}x${h}|${zoom}`;
  let p = bitmaps.get(k);
  if (!p) {
    const c = document.createElement("canvas");
    p = renderPage(doc, n, c, w, h, zoom).then(t => t.promise).then(() => c);
    p.catch(() => bitmaps.delete(k));
    bitmaps.set(k, p);
    if (bitmaps.size > 24) bitmaps.delete(bitmaps.keys().next().value as string);
  }
  return p;
}
