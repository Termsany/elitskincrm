/**
 * Resolves the real client IP from proxy headers.
 * nginx sets X-Real-IP to $remote_addr (not client-controllable), and appends
 * $remote_addr as the LAST hop of X-Forwarded-For. The FIRST X-Forwarded-For
 * entry is client-supplied and must never be trusted for rate limiting.
 */
export function getClientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
