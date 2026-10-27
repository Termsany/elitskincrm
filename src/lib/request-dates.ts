const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function requestDueToRiyadhInput(value: string | Date | null): string {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time + RIYADH_OFFSET_MS).toISOString().slice(0, 16);
}

export function riyadhInputToIso(value: string): string {
  if (!value) return '';
  const parsed = new Date(`${value}:00+03:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}
