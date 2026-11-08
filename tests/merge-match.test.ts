import { describe, expect, it } from "vitest";
import { clinicKey, clinicPairs, doctorPairs, type MClinic, type MDoctor } from "@/lib/merge-match";

const c = (id: string, name: string, city: string, clients: number[] = []): MClinic => ({ id, name, city, clients, doctors: 1, visits: 0 });
const d = (id: string, name: string, clinic_id: string | null, phone = ""): MDoctor => ({ id, name, clinic_id, clinic_name: "", phone, visits: 0 });

describe("clinic duplicates", () => {
  it("drops punctuation, generic words and the clinic's own city", () => {
    expect(clinicKey("HOSN - Dammam", "Dammam")).toBe(clinicKey("HOSN Dammam", "Dammam"));
    expect(clinicKey("Sola Clinic", "Al Khobar")).toBe(clinicKey("Sola", "Al Khobar"));
    expect(clinicKey("cham khobar", "Al Khobar")).toBe(clinicKey("Cham Clinic", "Al Khobar"));
  });
  it("finds the real duplicates, including a typo", () => {
    const p = clinicPairs([c("1", "HOSN - Dammam", "Dammam"), c("2", "HOSN Dammam", "Dammam"), c("3", "Alhokial hair transplant", "Al Khobar"), c("4", "Al hokail hair transplant", "Al Khobar"), c("5", "Sola", "Al Khobar"), c("6", "Sola Clinic", "Al Khobar")]);
    expect(p.map(x => x.a + x.b).sort()).toEqual(["12", "34", "56"]);
    expect(p.find(x => x.a === "3")?.strength).toBe("possible");
  });
  it("never pairs different branches or different cities", () => {
    expect(clinicPairs([c("1", "HOSN Dammam", "Dammam"), c("2", "HOSN Dahran", "Al Khobar"), c("3", "HOSN yarmouk", "Al Khobar")])).toEqual([]);
    expect(clinicPairs([c("1", "Bright", "Dammam"), c("2", "Bright", "Riyadh")])).toEqual([]);
  });
  it("never pairs clinics linked to different Daftra customers", () => {
    expect(clinicPairs([c("1", "Sola", "Al Khobar", [10]), c("2", "Sola Clinic", "Al Khobar", [11])])).toEqual([]);
    expect(clinicPairs([c("1", "Sola", "Al Khobar", [10]), c("2", "Sola Clinic", "Al Khobar", [10])])).toHaveLength(1);
  });
});

describe("doctor duplicates", () => {
  it("same name in the same clinic or with the same phone is strong; two clinics is only possible", () => {
    const p = doctorPairs([d("1", "Dr. Noha Abdelsattar", "c1"), d("2", "noha abdelsattar", "c1"), d("3", "Sahbaa Mohamed", "c2", "0551234567"), d("4", "sahbaa  mohamed", "c3", "+966551234567"), d("5", "Rana Ali", "c1"), d("6", "Rana Ali", "c9")]);
    const by = Object.fromEntries(p.map(x => [x.a + x.b, x.strength]));
    expect(by).toEqual({ "12": "strong", "34": "strong", "56": "possible" });
  });
  it("ignores different people", () => {
    expect(doctorPairs([d("1", "Ahmed Ali", "c1"), d("2", "Ahmed Adel", "c1")])).toEqual([]);
  });
});
