import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/fmt";

/** Any canonical UUID text (8-4-4-4-12 hex), as accepted by PostgreSQL's uuid type. */
export { UUID_RE };

/** True when every dynamic route param is a valid UUID. */
export function validIds(params: Record<string, string | string[] | undefined>) {
  return Object.values(params).every(v => typeof v === "string" && UUID_RE.test(v));
}

/** 400 response for malformed IDs (instead of letting PostgreSQL throw a 500). */
export const badId = () => NextResponse.json({ error: "معرّف غير صحيح" }, { status: 400 });
