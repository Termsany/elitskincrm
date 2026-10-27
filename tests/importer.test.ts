import { describe, expect, it } from 'vitest';
import { normalizeDoctorRows, normalizeProductsAndReps } from '@/lib/importer';

describe('workbook import normalization', () => {
  it('removes blank rows, trims Arabic text, and deduplicates doctors', () => {
    const rows = [
      { name: '  د. أحمد علي ', clinic: ' عيادة النور ', city: 'جدة', phone: '0500' },
      { name: 'د. أحمد علي', clinic: 'عيادة النور', city: 'جدة', phone: '0500' },
      { name: '', clinic: '' }
    ];
    expect(normalizeDoctorRows(rows)).toEqual([{ name: 'د. أحمد علي', clinicName: 'عيادة النور', city: 'جدة', phone: '0500' }]);
  });
  it('pairs four representatives with assigned products', () => {
    const result = normalizeProductsAndReps([
      { rep: 'سارة', product: 'منتج أ' }, { rep: 'ريم', product: 'منتج ب' },
      { rep: 'نورة', product: 'منتج ج' }, { rep: 'لينا', product: 'منتج د' }
    ]);
    expect(result.reps).toHaveLength(4);
    expect(result.products).toHaveLength(4);
    expect(result.assignments).toHaveLength(4);
  });
});
