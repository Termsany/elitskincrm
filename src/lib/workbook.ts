import type ExcelJS from "exceljs";

/** Unwraps exceljs' richer cell value shapes (formula result, rich text, hyperlink, Date) to a plain value. */
export function plainCell(value: ExcelJS.CellValue): unknown {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("result" in v) return plainCell(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
    if ("text" in v) return v.text;
  }
  return value;
}

/** Reads a worksheet into row objects keyed by its header row — exceljs has no built-in sheet-to-json. */
export function sheetToObjects(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values as ExcelJS.CellValue[]; // index 0 is always empty; columns start at 1
    if (rowNumber === 1) {
      values.forEach((v, i) => { headers[i] = String(plainCell(v) ?? "").trim(); });
      return;
    }
    const obj: Record<string, unknown> = {};
    values.forEach((v, i) => { if (headers[i]) obj[headers[i]] = plainCell(v); });
    rows.push(obj);
  });
  return rows;
}
