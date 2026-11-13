import type ExcelJS from "exceljs";
import { plainCell } from "./workbook";

/**
 * Full doctor-list sync from an Excel sheet: the file becomes the doctor list.
 * - rows that match an existing doctor update it (blank cells keep the old value)
 * - rows with no match are added
 * - doctors missing from the file are removed: deleted if they have no history,
 *   otherwise archived (status 'inactive') so past visits, plans and reports stay intact.
 */

export type SyncRow = { line: number; id: string; name: string; clinic_name: string; city: string; specialty: string; classification: string; phone: string; email: string };
export type Existing = { id: string; name: string; clinic_name: string; city: string; specialty: string; classification: string; phone: string; email: string; status: string };
type Field = "name" | "clinic_name" | "city" | "specialty" | "classification" | "phone" | "email";
const FIELDS: Field[] = ["name", "clinic_name", "city", "specialty", "classification", "phone", "email"];

const ALIASES: Record<Field | "id", string[]> = {
  id: ["id", "معرف الطبيب", "المعرف", "كود الطبيب"],
  name: ["name", "doctor", "doctor name", "اسم الطبيب", "الطبيب", "الاسم", "اسم الدكتور", "الدكتور"],
  clinic_name: ["clinic_name", "clinic", "account", "account / العيادة", "العيادة", "اسم العيادة", "المستشفى", "الجهة"],
  city: ["city", "area", "region", "المدينة", "المنطقة", "المحافظة"],
  specialty: ["specialty", "speciality", "التخصص"],
  classification: ["classification", "class", "category", "التصنيف", "الفئة", "الكلاس"],
  phone: ["phone", "mobile", "tel", "الهاتف", "الجوال", "التليفون", "الموبايل", "رقم الجوال", "رقم الهاتف"],
  email: ["email", "e-mail", "mail", "البريد", "البريد الإلكتروني", "الايميل", "الإيميل"],
};
const headerKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const ALIAS_TO_FIELD = new Map<string, Field | "id">();
for (const [f, list] of Object.entries(ALIASES)) for (const a of list) ALIAS_TO_FIELD.set(headerKey(a), f as Field | "id");

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Loose comparison key: ignores spaces, case, diacritics, tatweel, alef/yaa/taa-marbuta variants and a "Dr." prefix. */
export function normKey(s: string) {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/^\s*(د\s*\.|دكتور[ه]?|الدكتور[ه]?|dr\s*\.?)\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
const normPhone = (s: string) => { const d = s.replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : ""; };

export class SheetError extends Error {}

/** Finds the doctor sheet and its header row (first 10 rows), and reads the rows. */
export function readDoctorSheet(wb: ExcelJS.Workbook): { rows: SyncRow[]; skipped: number[]; sheet: string; columns: string[] } {
  for (const ws of wb.worksheets) {
    for (let hr = 1; hr <= Math.min(10, ws.rowCount); hr++) {
      const cols = new Map<number, Field | "id">();
      const vals = ws.getRow(hr).values as ExcelJS.CellValue[];
      vals.forEach((v, i) => { const f = ALIAS_TO_FIELD.get(headerKey(String(plainCell(v) ?? ""))); if (f && ![...cols.values()].includes(f)) cols.set(i, f); });
      if (![...cols.values()].includes("name")) continue;
      const rows: SyncRow[] = []; const skipped: number[] = [];
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const cells = ws.getRow(r).values as ExcelJS.CellValue[];
        const row: SyncRow = { line: r, id: "", name: "", clinic_name: "", city: "", specialty: "", classification: "", phone: "", email: "" };
        let any = false;
        for (const [i, f] of cols) { const v = clean(plainCell(cells?.[i])); if (v) any = true; row[f] = v; }
        if (!any) continue;
        row.classification = row.classification.toUpperCase();
        if (row.name.length < 2) { skipped.push(r); continue; }
        rows.push(row);
      }
      return { rows, skipped, sheet: ws.name, columns: [...cols.values()] };
    }
  }
  throw new SheetError("مالقيتش عمود «اسم الطبيب» في أول 10 صفوف من أي شيت — حط عناوين الأعمدة في أول صف");
}

export type Plan = {
  add: SyncRow[];
  update: Array<{ id: string; row: SyncRow; changes: Partial<Record<Field, [string, string]>>; reactivate: boolean }>;
  same: number;
  remove: Existing[];
  duplicates: Array<{ line: number; name: string; sameAs: number }>;
};

/** Matches file rows to existing doctors: by ID, then name + clinic, then name + phone, then a unique name. */
export function planSync(rows: SyncRow[], existing: Existing[]): Plan {
  const byId = new Map(existing.map(d => [d.id, d]));
  const multi = (f: (d: Existing) => string) => { const m = new Map<string, Existing[]>(); for (const d of existing) { const k = f(d); if (k === "") continue; m.set(k, [...(m.get(k) || []), d]); } return m; };
  const byNameClinic = multi(d => `${normKey(d.name)}|${normKey(d.clinic_name)}`);
  const byNamePhone = multi(d => normPhone(d.phone) ? `${normKey(d.name)}|${normPhone(d.phone)}` : "");
  const byName = multi(d => normKey(d.name));
  const taken = new Set<string>();
  const seen = new Map<string, number>();
  const plan: Plan = { add: [], update: [], same: 0, remove: [], duplicates: [] };
  const free = (list?: Existing[]) => {
    const l = (list || []).filter(d => !taken.has(d.id));
    return l.find(d => d.status === "active") || l[0];
  };

  for (const row of rows) {
    const fileKey = `${normKey(row.name)}|${normKey(row.clinic_name)}`;
    if (seen.has(fileKey)) { plan.duplicates.push({ line: row.line, name: row.name, sameAs: seen.get(fileKey)! }); continue; }
    seen.set(fileKey, row.line);
    let match = row.id && byId.has(row.id) && !taken.has(row.id) ? byId.get(row.id) : undefined;
    match ||= free(byNameClinic.get(fileKey));
    if (!match && normPhone(row.phone)) match = free(byNamePhone.get(`${normKey(row.name)}|${normPhone(row.phone)}`));
    if (!match && !row.clinic_name) { const l = (byName.get(normKey(row.name)) || []).filter(d => !taken.has(d.id)); if (l.length === 1) match = l[0]; }
    if (!match) { plan.add.push(row); continue; }
    taken.add(match.id);
    const changes: Partial<Record<Field, [string, string]>> = {};
    for (const f of FIELDS) if (row[f] && row[f] !== (match[f] || "")) changes[f] = [match[f] || "", row[f]];
    const reactivate = match.status !== "active";
    if (Object.keys(changes).length || reactivate) plan.update.push({ id: match.id, row, changes, reactivate });
    else plan.same++;
  }
  plan.remove = existing.filter(d => d.status === "active" && !taken.has(d.id));
  return plan;
}
