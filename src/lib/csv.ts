/**
 * Neutralises spreadsheet formula injection (CSV/DDE): a cell that starts with = + - @ or a control
 * character is executed by Excel as a formula. Plain numbers (e.g. -25) are left untouched.
 */
export function csvSafe(v: unknown): string {
  const s = String(v ?? "");
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
