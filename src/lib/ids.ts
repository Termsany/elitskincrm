import { NextResponse } from "next/server";

/** Any canonical UUID text (8-4-4-4-12 hex), as accepted by PostgreSQL's uuid type. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when every dynamic route param is a valid UUID. */
export function validIds(params: Record<string, string | string[] | undefined>) {
  return Object.values(params).every(v => typeof v === "string" && UUID_RE.test(v));
}

/** 400 response for malformed IDs (instead of letting PostgreSQL throw a 500). */
export const badId = () => NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
