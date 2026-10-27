import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { plainCell, sheetToObjects } from '@/lib/workbook';
import { normalizeDoctorImportRow } from '@/lib/doctor-import';

async function buildWorkbookSheet(headers: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('sheet1');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return sheet;
}

describe('sheetToObjects', () => {
  it('keys each row by the header row, trims header whitespace, and ignores unheaded columns', async () => {
    const sheet = await buildWorkbookSheet(
      ['اسم الطبيب', 'المدينة'],
      [['د. سارة', 'جدة'], ['د. منى', 'الرياض']],
    );
    expect(sheetToObjects(sheet)).toEqual([
      { 'اسم الطبيب': 'د. سارة', 'المدينة': 'جدة' },
      { 'اسم الطبيب': 'د. منى', 'المدينة': 'الرياض' },
    ]);
  });

  it('feeds correctly into normalizeDoctorImportRow for the bulk-upload route (English or Arabic headers)', async () => {
    const sheet = await buildWorkbookSheet(
      ['name', 'city', 'phone'],
      [['Dr. Ahmed', 'Jeddah', '0500000000']],
    );
    const [row] = sheetToObjects(sheet);
    expect(normalizeDoctorImportRow(row)).toMatchObject({ name: 'Dr. Ahmed', city: 'Jeddah', phone: '0500000000', status: 'active' });
  });
});

describe('plainCell', () => {
  it('unwraps rich text and formula results, and passes plain values through', () => {
    expect(plainCell('plain')).toBe('plain');
    expect(plainCell(42)).toBe(42);
    expect(plainCell(null)).toBe('');
    expect(plainCell({ richText: [{ text: 'a' }, { text: 'b' }] } as never)).toBe('ab');
    expect(plainCell({ formula: 'A1+A2', result: 7 } as never)).toBe(7);
  });
});
