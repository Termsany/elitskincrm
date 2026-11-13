import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { normKey, planSync, readDoctorSheet, SheetError, type Existing, type SyncRow } from "@/lib/doctor-sync";

const ex = (id: string, name: string, clinic_name = "", o: Partial<Existing> = {}): Existing => ({ id, name, clinic_name, city: "", specialty: "", classification: "", phone: "", email: "", status: "active", ...o });
let line = 1;
const row = (name: string, clinic_name = "", o: Partial<SyncRow> = {}): SyncRow => ({ line: ++line, id: "", name, clinic_name, city: "", specialty: "", classification: "", phone: "", email: "", ...o });

describe("doctor list sync", () => {
  it("normalizes Arabic spelling variants and the Dr. prefix", () => {
    expect(normKey("د. أحمد  علي")).toBe(normKey("احمد علي"));
    expect(normKey("Dr. Sara")).toBe(normKey("sara"));
    expect(normKey("عيادة النخبة")).toBe(normKey("عياده النخبه"));
  });

  it("adds new, updates changed, keeps same, removes missing", () => {
    const p = planSync(
      [row("أحمد علي", "النخبة", { city: "الرياض" }), row("سارة", "الندى"), row("خالد", "جديد")],
      [ex("1", "د. احمد علي", "النخبه"), ex("2", "سارة", "الندى"), ex("3", "منى", "قديمة")],
    );
    expect(p.add.map(r => r.name)).toEqual(["خالد"]);
    expect(p.update).toHaveLength(1);
    expect(p.update[0].id).toBe("1");
    expect(p.update[0].changes.city).toEqual(["", "الرياض"]);
    expect(p.same).toBe(1);
    expect(p.remove.map(d => d.id)).toEqual(["3"]);
  });

  it("blank cells keep existing values", () => {
    const p = planSync([row("سارة", "الندى", { phone: "" })], [ex("2", "سارة", "الندى", { phone: "0500000000" })]);
    expect(p.same).toBe(1);
  });

  it("matches by ID first, even when the name changed", () => {
    const p = planSync([row("سارة محمد", "الندى", { id: "2" })], [ex("2", "سارة", "الندى")]);
    expect(p.update[0].changes.name).toEqual(["سارة", "سارة محمد"]);
    expect(p.remove).toHaveLength(0);
  });

  it("matches by name + phone when the clinic changed", () => {
    const p = planSync([row("منى", "عيادة جديدة", { phone: "+966 50 111 2222" })], [ex("3", "منى", "قديمة", { phone: "0501112222" })]);
    expect(p.update[0].id).toBe("3");
    expect(p.add).toHaveLength(0);
  });

  it("reactivates an archived doctor that is back in the file and never removes archived ones", () => {
    const p = planSync([row("منى", "قديمة")], [ex("3", "منى", "قديمة", { status: "inactive" }), ex("4", "هالة", "x", { status: "inactive" })]);
    expect(p.update[0].reactivate).toBe(true);
    expect(p.remove).toHaveLength(0);
  });

  it("fills in the clinic of a doctor saved earlier without one instead of adding a copy", () => {
    const p = planSync([row("Rasha Gad", "Mcc", { city: "Al Khobar" })], [ex("7", "Rasha Gad", "")]);
    expect(p.add).toHaveLength(0);
    expect(p.update[0].changes.clinic_name).toEqual(["", "Mcc"]);
  });

  it("does not merge same-name doctors in two different clinics", () => {
    const p = planSync([row("Ahmed Ali", "Clinic B")], [ex("1", "Ahmed Ali", "Clinic A")]);
    expect(p.add).toHaveLength(1);
    expect(p.remove).toHaveLength(1);
  });

  it("flags duplicate rows in the file and uses the first", () => {
    const p = planSync([row("خالد", "س"), row("د. خالد", "س")], []);
    expect(p.add).toHaveLength(1);
    expect(p.duplicates).toHaveLength(1);
  });

  it("does not match the same existing doctor twice", () => {
    const p = planSync([row("خالد", "", { id: "9" }), row("خالد", "س", { phone: "0501234567" })], [ex("9", "خالد", "", { phone: "0501234567" })]);
    expect(p.update.length + p.same).toBe(1);
    expect(p.add).toHaveLength(1);
  });
});

describe("reading the sheet", () => {
  it("finds the header row and maps Arabic headers", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["قائمة الأطباء"]);
    ws.addRow(["اسم الطبيب", "العيادة", "CLASS", "الجوال"]);
    ws.addRow(["  أحمد  ", "النخبة", "a", 501234567]);
    ws.addRow([]);
    ws.addRow(["", "عيادة بدون طبيب"]);
    const r = readDoctorSheet(wb);
    expect(r.rows).toEqual([{ line: 3, id: "", name: "أحمد", clinic_name: "النخبة", city: "", specialty: "", classification: "A", phone: "501234567", email: "" }]);
    expect(r.skipped).toEqual([5]);
  });

  it("reads combined English headers like \"Account / Clinic\" and \"City / Area\"", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("doctor list");
    ws.addRow(["Doctor Name", "Account / Clinic", "Specialty", "Class", "City / Area", "Email", "Mobile"]);
    ws.addRow(["Ahmed Soliman", "Hosn clinic", "DERMA", "a", "Al Khobar", "x@y.com", "0545357720"]);
    expect(readDoctorSheet(wb).rows[0]).toEqual({ line: 2, id: "", name: "Ahmed Soliman", clinic_name: "Hosn clinic", city: "Al Khobar", specialty: "DERMA", classification: "A", phone: "0545357720", email: "x@y.com" });
  });

  it("explains when there is no name column", () => {
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("x").addRow(["a", "b"]);
    expect(() => readDoctorSheet(wb)).toThrow(SheetError);
  });
});
