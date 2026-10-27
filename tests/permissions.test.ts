import { describe, expect, it } from 'vitest';
import { canAccessVisit, canCreateVisit, canManageMasterData } from '@/lib/permissions';

describe('role permissions', () => {
  it('lets admins access every visit and master data without creating field visits', () => {
    expect(canAccessVisit({ role: 'admin', id: 'a' }, 'rep-2')).toBe(true);
    expect(canManageMasterData({ role: 'admin', id: 'a' })).toBe(true);
    expect(canCreateVisit('admin')).toBe(false);
  });

  it('limits reps to their own visits and lets them create field visits', () => {
    const rep = { role: 'sales_rep' as const, id: 'rep-1' };
    expect(canAccessVisit(rep, 'rep-1')).toBe(true);
    expect(canAccessVisit(rep, 'rep-2')).toBe(false);
    expect(canManageMasterData(rep)).toBe(false);
    expect(canCreateVisit('sales_rep')).toBe(true);
  });
});
