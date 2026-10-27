import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { hashSessionToken } from "@/lib/auth";
export async function POST() {
  const token = (await cookies()).get("elite_session")?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash=$1", [hashSessionToken(token)]);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("elite_session", "", { path: "/", maxAge: 0 });
  return res;
}