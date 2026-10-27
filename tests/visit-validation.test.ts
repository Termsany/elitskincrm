import { describe, expect, it } from 'vitest';
import { visitSchema } from '@/lib/validation';

describe('visit validation', () => {
  const valid = { doctorId: '00000000-0000-4000-8000-000000000001', notes: 'تمت مناقشة احتياج العيادة بالتفصيل', status: 'completed', sampleItems: [], orderItems: [] };
  it('accepts a complete visit with mandatory notes', () => expect(visitSchema.safeParse(valid).success).toBe(true));
  it('rejects missing or trivial notes', () => expect(visitSchema.safeParse({ ...valid, notes: 'قصير' }).success).toBe(false));
  it('rejects invalid quantities and statuses', () => {
    expect(visitSchema.safeParse({ ...valid, status: 'bad' }).success).toBe(false);
    expect(visitSchema.safeParse({ ...valid, sampleItems: [{ productId: valid.doctorId, quantity: 0 }] }).success).toBe(false);
  });
});
