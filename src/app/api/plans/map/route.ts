import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { cityKey, coverageRows, frequencies, monthFrac, need, repCities } from "@/lib/territory";

/** Admin: city × rep coverage this month, each rep's cities, and A doctors nobody visited yet. */
export async function GET() {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const today = riyadhToday(), month = today.slice(0, 7);
  const reps = (await query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows;
  const ids = reps.map(r => r.id);
  const [areas, cov, freq, docs] = await Promise.all([
    repCities(ids), coverageRows(ids, month, today), frequencies(),
    query<{ id: string; name: string; clinic: string; city: string; cls: string | null; seen: boolean }>(`SELECT d.id, d.name, COALESCE(d.clinic_name,'') clinic, btrim(COALESCE(d.city,'')) city, NULLIF(upper(d.classification),'') cls,
        EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= $1::date) seen
      FROM doctors d WHERE d.status='active' ORDER BY d.name`, [`${month}-01`]),
  ]);
  const frac = monthFrac(today);
  const cities = new Map<string, { city: string; doctors: number; a: number; aUnseen: Array<{ id: string; name: string; clinic: string }>; cells: Record<string, { required: number; done: number }> }>();
  const label = (c: string) => c || "بدون مدينة";
  for (const d of docs.rows) {
    const k = cityKey(d.city), c = cities.get(k) || { city: label(d.city), doctors: 0, a: 0, aUnseen: [], cells: {} };
    c.doctors++; if (d.cls === "A") { c.a++; if (!d.seen) c.aUnseen.push({ id: d.id, name: d.name, clinic: d.clinic }); }
    cities.set(k, c);
  }
  const owns = (repId: string, city: string) => { const a = areas.get(repId)!; return a.cities.some(x => cityKey(x) === cityKey(city)); };
  for (const r of cov) {
    const c = cities.get(cityKey(r.city)); if (!c || !owns(r.rep_id, r.city)) continue;
    const req = need(r.cls, freq) * frac, cell = c.cells[r.rep_id] || { required: 0, done: 0 };
    cell.required += req; cell.done += Math.min(r.n, Math.ceil(req)); c.cells[r.rep_id] = cell;
  }
  const out = [...cities.values()].map(c => ({ ...c, cells: Object.fromEntries(Object.entries(c.cells).map(([k, v]) => [k, { required: Math.round(v.required), done: v.done }])),
    owners: Object.keys(c.cells), aUnseen: c.aUnseen.slice(0, 30), aUnseenCount: c.aUnseen.length }))
    .sort((a, b) => b.aUnseenCount - a.aUnseenCount || b.doctors - a.doctors);
  return NextResponse.json({ month, reps: reps.map(r => ({ ...r, ...areas.get(r.id)! })), cities: out });
}
