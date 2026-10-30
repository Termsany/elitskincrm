import { describe, it, expect } from 'vitest';
import { monthKey, riyadhNow, validateLines, canSubmit, paceWarning, deadlineReminder, canCloseAfter } from '@/lib/forecast-contract';

describe('forecast policy', () => {
  it('rejects malformed months and invalid or duplicate lines', () => {
    expect(() => monthKey('2026-13')).toThrow();
    expect(() => validateLines([{clinic_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-abc',product_id:'22222222-2222-4222-8222-222222222222',quantity:2}])).toThrow();
    expect(() => validateLines([{clinic_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',quantity:0}])).toThrow();
    expect(() => validateLines([{clinic_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',quantity:2},{clinic_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',quantity:3}])).toThrow();
    expect(validateLines([{clinic_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',quantity:2}])).toHaveLength(1);
  });
  it('uses Riyadh day for submission and late exception', () => {
    expect(riyadhNow(new Date('2026-10-03T21:30:00Z')).day).toBe(4);
    expect(canSubmit('2026-10', new Date('2026-10-03T21:30:00Z'), false)).toBe(false);
    expect(canSubmit('2026-10', new Date('2026-10-03T21:30:00Z'), true)).toBe(true);
    expect(canSubmit('2026-09', new Date('2026-10-01T00:00:00Z'), true)).toBe(false);
  });
  it('permits a delayed close after the last day once pending decisions clear', () => {
    expect(canCloseAfter('2026-10', new Date('2026-10-30T20:00:00Z'))).toBe(false);
    expect(canCloseAfter('2026-10', new Date('2026-10-31T21:00:00Z'))).toBe(true);
  });
  it('only warns on pace after day ten and reminds after 48h without approval', () => {
    expect(paceWarning(10, 1, 30)).toBe(false);
    expect(paceWarning(11, 1, 30)).toBe(true);
    expect(paceWarning(14, 14, 30, 28)).toBe(true);
    expect(paceWarning(14, 13, 28, 28)).toBe(true);
    expect(deadlineReminder(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-03T00:00:00Z'))).toBe(true);
  });
});
