/**
 * Sales manager scope. A sales manager acts as an admin across sales work, except on these paths,
 * where the session reports the real role ("sales_manager") so every admin check there fails closed
 * (and rep-style pages fall back to the manager's own records, e.g. their own expense claims).
 */
const DENY_ALL = [
  "/daftra-sales", "/api/admin/finance", "/api/admin/daftra", "/api/admin/dashboard/daftra", // company accounts
  "/expenses", "/api/expenses", "/api/admin/expenses",                                       // company spending
  "/admin/audit", "/api/admin/audit",                                                        // change log
  "/admin/document-signing", "/api/admin/document-assets", "/library", "/api/library", "/requests", "/api/requests", // company documents & signatures
  "/admin/products", "/api/admin/products",                                                  // products & prices master data
  "/api/admin/reps", "/api/hr-requests", "/api/admin/merge", "/api/admin/password-resets",                                                    // users lifecycle, leave & salary deductions                                                                         // deactivate / lifecycle of users
];
/** Read is fine (the reps list), changes are not (create users, roles, passwords). */
const DENY_WRITE = ["/api/admin/users"];
const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`);
export function managerDenied(path: string, method = "GET") {
  const p = (path || "/").split("#")[0];
  if (DENY_ALL.some(b => under(p, b))) return true;
  return method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD" && DENY_WRITE.some(b => under(p, b));
}
