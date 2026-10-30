import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { pool } from "@/lib/db";
import { UUID_RE } from "@/lib/product-studio";

type View = { productId: string; brochureId?: string | null; page: number; seconds: number };
const REACTIONS = new Set(["interested", "neutral", "not_interested"]);

// Store one presentation (which product/page was shown and for how long). Sent with sendBeacon on close.
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { doctorId?: string; startedAt?: string; endedAt?: string; views?: View[]; reactions?: Record<string, string> } | null;
  if (!body || !Array.isArray(body.views)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const views = body.views.filter(v => UUID_RE.test(v.productId) && Number.isFinite(v.page) && Number.isFinite(v.seconds) && v.seconds >= 1)
    .slice(0, 500).map(v => ({ ...v, page: Math.max(1, Math.min(999, Math.round(v.page))), seconds: Math.min(3600, Math.round(v.seconds)) }));
  if (!views.length) return NextResponse.json({ ok: true, skipped: true });
  const started = new Date(body.startedAt || Date.now()), ended = new Date(body.endedAt || Date.now());
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const doctorId = body.doctorId && UUID_RE.test(body.doctorId) ? body.doctorId : null;
  const total = views.reduce((a, v) => a + v.seconds, 0);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const s = await client.query("INSERT INTO detailing_sessions(rep_id, doctor_id, started_at, ended_at, seconds) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id, doctorId, started, ended, total]);
    const sid = s.rows[0].id;
    for (const v of views) {
      const reaction = body.reactions?.[v.productId];
      await client.query(
        `INSERT INTO detailing_views(session_id, product_id, brochure_id, page, seconds, reaction)
         SELECT $1, p.id, (SELECT b.id FROM product_brochures b WHERE b.id=$3::uuid AND b.product_id=p.id), $4, $5, $6 FROM products p WHERE p.id=$2`,
        [sid, v.productId, v.brochureId && UUID_RE.test(v.brochureId) ? v.brochureId : null, v.page, v.seconds, reaction && REACTIONS.has(reaction) ? reaction : null]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: sid });
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
