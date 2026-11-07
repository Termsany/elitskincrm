import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
/** Scheduled jobs called by the server timers (each route checks CRON_SECRET or an admin session itself). */
const CRON_PATHS = ["/api/admin/morning-summary", "/api/admin/smart-daily", "/api/plans/auto"];
export function proxy(req: NextRequest) {
  const token = req.cookies.get("elite_session")?.value;
  const isAuth = !!token;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  const isPublic = req.nextUrl.pathname === "/sw.js" || req.nextUrl.pathname === "/manifest.webmanifest" || req.nextUrl.pathname.startsWith("/icons/") || req.nextUrl.pathname.startsWith("/brand/") || req.nextUrl.pathname.startsWith("/api/health") || req.nextUrl.pathname.startsWith("/api/auth") || req.nextUrl.pathname === "/api/tasks/reminders" || req.nextUrl.pathname === "/api/calendar/reminders" || req.nextUrl.pathname === "/verify" || req.nextUrl.pathname === "/api/verify" || req.nextUrl.pathname === "/api/admin/visits/weekly-report" || CRON_PATHS.includes(req.nextUrl.pathname);
  if (isPublic) return NextResponse.next();
  if (!isAuth && !isLogin && req.nextUrl.pathname !== "/") return NextResponse.redirect(new URL("/login", req.url));
  if (isAuth && isLogin) return NextResponse.redirect(new URL("/", req.url));
  // the path/method let the session apply the sales-manager scope (see lib/manager-scope)
  const h = new Headers(req.headers); h.set("x-es-path", req.nextUrl.pathname); h.set("x-es-method", req.method);
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
