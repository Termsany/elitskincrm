import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/target-planning", () => ({ setAnnual: vi.fn(), setOverride: vi.fn(), adminTargetView: vi.fn() }));
vi.mock("@/lib/forecast", () => ({ adminView: vi.fn() }));
import { priceTarget, arabicError } from "@/lib/sales-admin";

describe("product targets", () => {
  const prices = new Map([["a", 400], ["b", 250]]);
  it("money → units (floor) and units → money", () => {
    const r = priceTarget([{ product_id: "a", mode: "amount", value: 50000 }, { product_id: "b", mode: "units", value: 30 }], prices);
    expect(r[0]).toMatchObject({ quantity: 125, amount: 50000 });
    expect(r[1]).toMatchObject({ quantity: 30, amount: 7500 });
  });
  it("ignores empty lines and needs a price", () => {
    expect(priceTarget([{ product_id: "a", mode: "units", value: 0 }], prices)).toHaveLength(0);
    expect(() => priceTarget([{ product_id: "x", mode: "units", value: 2 }], prices)).toThrow("حدد سعر المنتج");
  });
  it("translates locking errors", () => {
    expect(arabicError(new Error("Distribution already submitted; annual target locked"))).toContain("اعتمده أو ارفضه");
  });
});
