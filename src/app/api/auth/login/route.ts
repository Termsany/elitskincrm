import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, verifyPassword, createSessionToken, hashSessionToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { hitRateLimitDb, peekBlockedDb, clearRateLimitDb } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

// Per-IP throttle: counts every attempt (brute-force / spam protection).
const IP_LIMIT = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;
// Per-account lockout: counts only failed password attempts for a real user;
// reset on a successful login.
const ACCT_LIMIT = 5;
const ACCT_WINDOW_MS = 15 * 60 * 1000;

// Dummy hash so a login for a non-existent user still spends bcrypt time,
// keeping response timing independent of whether the account exists.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(createSessionToken()));

function tooMany(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many attempts. Try later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipRl = await hitRateLimitDb(`login:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!ipRl.allowed) return tooMany(ipRl.retryAfterMs);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, password } = parsed.data;
  const acctKey = `login:acct:${email.toLowerCase()}`;

  // Already locked out? Reject before touching the password.
  const lockedMs = await peekBlockedDb(acctKey);
  if (lockedMs > 0) return tooMany(lockedMs);

  const r = await query<{ id: string; password_hash: string; active: boolean }>(
    "SELECT id, password_hash, active FROM users WHERE lower(email)=lower($1) LIMIT 1",
    [email],
  );
  const user = r.rows[0];
  const ok = user && user.active
    ? await verifyPassword(password, user.password_hash)
    : (await verifyPassword(password, await getDummyHash()), false);

  if (!ok) {
    // Count the failure against the account only for a real, active user —
    // avoids filling the table with attacker-supplied emails.
    if (user && user.active) {
      const acctRl = await hitRateLimitDb(acctKey, ACCT_LIMIT, ACCT_WINDOW_MS, ACCT_WINDOW_MS);
      if (!acctRl.allowed) return tooMany(acctRl.retryAfterMs);
    }
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Successful login clears the account's failure counter.
  await clearRateLimitDb(acctKey);

  const token = createSessionToken();
  const hash = hashSessionToken(token);
  await query("INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2, now()+interval '14 days')", [user.id, hash]);
  await query("UPDATE users SET last_login_at=now() WHERE id=$1", [user.id]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("elite_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
