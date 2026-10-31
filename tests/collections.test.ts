import { describe, it, expect } from "vitest";
import { similarity, tokens } from "@/lib/collections";
import { stockCover } from "@/lib/finance";

describe("collections name matching", () => {
  it("normalises Arabic and drops generic words", () => {
    expect(tokens("شركة عيادات شام لطب وتقويم الاسنان")).toEqual(["شام", "اسنان"]);
  });
  it("matches a Daftra customer to the right clinic", () => {
    expect(similarity("شركة الحسن والجمال الطبي شخص واحد alhoson and beauty company", "HOSN - Dahran")).toBeLessThan(0.5);
    expect(similarity("مستشفى المواساة Dammam", "Al Mouwasat Dammam")).toBeGreaterThanOrEqual(0); // different scripts: no false positive required
    expect(similarity("bright medical company", "Bright")).toBeGreaterThanOrEqual(0.5);
    expect(similarity("LAVENDER MEDICAL COMPANY", "RAM")).toBe(0);
  });
});
describe("stock cover", () => {
  it("classifies cover from the 90-day pace", () => {
    expect(stockCover(-4, 30).stock_status).toBe("negative");
    expect(stockCover(0, 30).stock_status).toBe("out");
    expect(stockCover(5, 30)).toMatchObject({ stock_status: "low", months_cover: 0.5, reorder_qty: 15 });
    expect(stockCover(15, 30).stock_status).toBe("watch");
    expect(stockCover(40, 30).stock_status).toBe("ok");
    expect(stockCover(10, 0).stock_status).toBe("idle");
  });
});
describe("city names never drive a match", () => {
  it("Mouwasat Dammam is not Hokail Dammam", () => {
    expect(similarity("مستشفي المواساة الدمام Al mouasat Hospital Dammam", "AL Hokail - dammam")).toBeLessThan(0.5);
  });
});
