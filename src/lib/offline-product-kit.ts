export type OfflineProduct = { id: string; name: string; brochure_available?: boolean };
export const OFFLINE_PRODUCT_CACHE = "elite-product-detailing-v1";
export function productBrochureUrl(id: string): string {
  return `/api/products/${encodeURIComponent(id)}/brochure`;
}
export function offlineProductCacheKey(id: string): string {
  return `/offline/products/${encodeURIComponent(id)}`;
}
export function offlineProductSummary(products: OfflineProduct[]) {
  const brochures = products.filter((product) => product.brochure_available).length;
  return { products: products.length, brochures, missingBrochures: products.length - brochures };
}
