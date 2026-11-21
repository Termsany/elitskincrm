import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { riyadhToday } from "@/lib/fmt";

const FINANCE_URL = process.env.FINANCE_APP_URL || "https://finance.eliteskinsa.com";
const SHARED_KEY = process.env.SHARED_API_KEY;

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (u.role !== "sales_rep") return NextResponse.json({ error: "للمندوبين فقط" }, { status: 403 });
  if (!SHARED_KEY) return NextResponse.json({ error: "الربط مع المالية مش متضبط" }, { status: 500 });

  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") || riyadhToday().slice(0, 7);

  try {
    const res = await fetch(`${FINANCE_URL}/api/shared/samples-promo?month=${month}&rep=${encodeURIComponent(u.name)}`, {
      headers: { "x-api-key": SHARED_KEY },
      next: { revalidate: 300 },
    });
    if (!res.ok) return NextResponse.json({ error: "تعذر جلب بيانات العينات من المالية" }, { status: 502 });
    const data = await res.json();
    const rep = data.reps?.[0] || null;
    if (!rep) return NextResponse.json({ month, found: false, rep: null });
    return NextResponse.json({ month, found: true, rep });
  } catch {
    return NextResponse.json({ error: "تعذر الاتصال بالمالية" }, { status: 502 });
  }
}
