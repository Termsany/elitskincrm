import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: {} }));
import { branchMatch } from "@/lib/clinic-groups";

describe("branch matching", () => {
  const hosn = "شركة الحسن والجمال الطبي شخص واحد alhoson and beauty company";
  it("matches branches of a chain by brand word", () => {
    expect(branchMatch(hosn, "HOSN yarmouk")).toBe("strong");
    expect(branchMatch(hosn, "HOSN - Dahran")).toBe("strong");
    expect(branchMatch("شركة رونق الطبي شركة شخص واحد rawnaq medical company", "RAWNAQ Clinics")).toBe("strong");
    expect(branchMatch("AHALINA MEDICAL CLINICS CO", "Ahalena Bavelon")).toBe("strong");
  });
  it("does not match on city or generic words", () => {
    expect(branchMatch(hosn, "AL Manea Hospital - khobar")).toBe(false);
    expect(branchMatch("مستشفي المواساة الدمام Al mouasat Hospital Dammam", "Saudi German hospital")).toBe(false);
  });
});

describe("arabic ↔ latin branch names", () => {
  it("matches transliterated brand names", () => {
    expect(branchMatch("شركة عيادات زارا لطب الاسنان", "zara dammam")).toBe("weak");
    expect(branchMatch("شركة صولا كير", "Sola Clinic")).toBe("weak");
    expect(branchMatch("شركة عيادات شام لطب وتقويم الاسنان والجلدية shaam clinics company", "Cham Clinic")).toBeTruthy();
    expect(branchMatch("مستشفي المواساة الدمام Al mouasat Hospital Dammam", "AL Salam")).toBe(false);
  });
});
