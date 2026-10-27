import { describe, expect, it } from "vitest";
import { offlineProductCacheKey, productBrochureUrl, offlineProductSummary } from "@/lib/offline-product-kit";

describe("offline product kit", () => {
  it("uses stable same-origin keys for product assets", () => {
    expect(productBrochureUrl("product-1")).toBe("/api/products/product-1/brochure");
    expect(offlineProductCacheKey("product-1")).toBe("/offline/products/product-1");
  });
  it("summarizes cached and missing brochures without inventing availability", () => {
    expect(offlineProductSummary([
      { id: "1", name: "A", brochure_available: true },
      { id: "2", name: "B", brochure_available: false },
    ])).toEqual({ products: 2, brochures: 1, missingBrochures: 1 });
  });
});
