const CACHE = "elite-product-detailing-v1";
const OFFLINE_PAGE = "/products";
self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
function isProductAsset(url) {
  return url.pathname === "/products" || url.pathname === "/api/products" || url.pathname.startsWith("/api/products/");
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isProductAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request);
        return cached || (url.pathname === OFFLINE_PAGE ? new Response("المنتجات غير متاحة بدون إنترنت بعد. افتحها مرة واحدة أثناء الاتصال.", {status: 503, headers: {"content-type": "text/plain; charset=utf-8"}}) : new Response("غير متاح بدون إنترنت", {status: 503}));
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
