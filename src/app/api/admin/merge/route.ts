import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { MergeError, mergeClinics, mergeDoctors, mergeSuggestions } from "@/lib/merge";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function admin() { const u = await getCurrentUser(); return u && u.role === "admin" && !u.manager ? u : null; }

/** Duplicate clinics / doctors: suggestions (GET), merge (POST), "not the same" (PUT). Admin only. */
export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await mergeSuggestions());
}

export async function POST(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { kind?: string; keep?: string; drop?: string } | null;
  if (!b || (b.kind !== "clinic" && b.kind !== "doctor") || !UUID_RE.test(b.keep || "") || !UUID_RE.test(b.drop || "")) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  try {
    const result = b.kind === "clinic" ? await mergeClinics(b.keep!, b.drop!, u.id) : await mergeDoctors(b.keep!, b.drop!, u.id);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof MergeError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("merge failed", e); return NextResponse.json({ error: "تعذر الدمج — مفيش حاجة اتغيرت" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const u = await admin(); if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null) as { kind?: string; a?: string; b?: string } | null;
  if (!b || (b.kind !== "clinic" && b.kind !== "doctor") || !UUID_RE.test(b.a || "") || !UUID_RE.test(b.b || "")) return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const [x, y] = [b.a!, b.b!].sort();
  await query("INSERT INTO merge_dismissals(kind, a, b, by_user) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [b.kind, x, y, u.id]);
  return NextResponse.json({ ok: true });
}
