import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { daftraConfigured, syncDaftra } from "@/lib/daftra";

export const maxDuration = 300;
/** Admin-triggered sync with Daftra (waits for completion). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!daftraConfigured()) return NextResponse.json({ error: "ربط دفترة غير مُعدّ على السيرفر" }, { status: 503 });
  try { return NextResponse.json(await syncDaftra()); }
  catch (e) { console.error("daftra sync", e); return NextResponse.json({ error: "تعذرت المزامنة مع دفترة — حاول بعد قليل" }, { status: 502 }); }
}
