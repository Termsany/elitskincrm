import { describe, expect, it } from 'vitest';
import { requestDueToRiyadhInput, riyadhInputToIso } from '@/lib/request-dates';

describe('request deadline timezone', () => {
  it('shows UTC deadlines as Riyadh datetime-local values', () => {
    expect(requestDueToRiyadhInput('2026-10-26T09:30:00.000Z')).toBe('2026-10-26T12:30');
  });

  it('submits Riyadh datetime-local values as absolute ISO instants', () => {
    expect(riyadhInputToIso('2026-10-26T12:30')).toBe('2026-10-26T09:30:00.000Z');
  });
});
