import { query } from "@/lib/db";

/* ───────── Visit intelligence: quality score, location checks, bursts, summaries ───────── */
export const DAY_RE = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export function periodRange(period: string, from?: string | null, to?: string | null) {
  const t = riyadhToday();
  if (period === "custom" && from && to && DAY_RE.test(from) && DAY_RE.test(to)) return from <= to ? { from, to } : { from: to, to: from };
  if (period === "yesterday") { const y = addDays(t, -1); return { from: y, to: y }; }
  if (period === "week") { const dow = new Date(`${t}T12:00:00Z`).getUTCDay(); return { from: addDays(t, -dow), to: t }; } // week starts Sunday
  if (period === "month") return { from: `${t.slice(0, 8)}01`, to: t };
  if (period === "30d") return { from: addDays(t, -29), to: t };
  return { from: t, to: t };
}

export type Flag = { code: "burst" | "rapid" | "far" | "no_gps" | "weak_gps" | "no_notes" | "no_products"; label: string; tone: "red" | "amber" };
export type EVisit = {
  id: string; visited_at: string; day: string; hm: string; status: string; notes: string; lat: number | null; lng: number | null; accuracy_m: number | null;
  follow_up_at: string | null; follow_up_note: string | null; rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string; clinic_key: string; city: string; classification: string | null; specialty: string | null;
  presented: Array<{ product_id: string; name: string; reaction: string }>; samples: number; orders: number; followups: number; attachments: number; detail_sec: number; planned: boolean;
  rating: number | null; review_comment: string | null;
  score: number | null; band: "excellent" | "good" | "weak" | null; parts: { location: number; content: number; outcome: number; plan: number };
  flags: Flag[]; burst_size: number; burst_clinics: number; distance_m: number | null; clinic_loc: { lat: number; lng: number; source: "manual" | "learned"; n: number } | null;
};

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const clinicKey = (clinicId: string | null, clinicName: string | null, doctorId: string) =>
  clinicId ? `c:${clinicId}` : clinicName?.trim() ? `n:${clinicName.trim().toLowerCase().replace(/\s+/g, " ")}` : `d:${doctorId}`;

const BURST_MIN = 10, BURST_M = 60, FAR_M = 300, ACC_OK = 100;

type Pt = { id: string; rep: string; key: string; t: number; lat: number; lng: number; acc: number | null };
/** Visits by one rep logged within minutes, from the same spot, for different clinics. */
function findBursts(pts: Pt[]) {
  const out = new Map<string, { size: number; clinics: number }>();
  const byRep = new Map<string, Pt[]>();
  for (const p of pts) (byRep.get(p.rep) || byRep.set(p.rep, []).get(p.rep)!).push(p);
  for (const list of byRep.values()) {
    list.sort((a, b) => a.t - b.t);
    for (let i = 0; i < list.length; i++) {
      const group = new Set<string>([list[i].id]); const keys = new Set([list[i].key]);
      for (let j = 0; j < list.length; j++) {
        if (i === j || Math.abs(list[j].t - list[i].t) > BURST_MIN * 60000) continue;
        if (haversine(list[i], list[j]) <= BURST_M) { group.add(list[j].id); keys.add(list[j].key); }
      }
      if (keys.size >= 3 || (keys.size >= 2 && group.size >= 3)) for (const id of group) { const o = out.get(id); if (!o || keys.size > o.clinics || (keys.size === o.clinics && group.size > o.size)) out.set(id, { size: group.size, clinics: keys.size }); }
    }
  }
  return out;
}

/** Clinic location: manager pin wins; otherwise learned from ≥2 accurate, non-burst visits that agree within 150 m. */
async function clinicLocations(keys: string[], hist: Pt[], bursts: Map<string, { size: number; clinics: number }>) {
  const res = new Map<string, { lat: number; lng: number; source: "manual" | "learned"; n: number }>();
  if (keys.length) {
    const m = (await query(`SELECT clinic_key, lat, lng FROM clinic_locations WHERE clinic_key = ANY($1::text[])`, [keys])).rows as Array<{ clinic_key: string; lat: number; lng: number }>;
    for (const r of m) res.set(r.clinic_key, { lat: r.lat, lng: r.lng, source: "manual", n: 0 });
  }
  const byKey = new Map<string, Pt[]>();
  for (const p of hist) if (!bursts.has(p.id) && p.acc !== null && p.acc <= ACC_OK && !res.has(p.key)) (byKey.get(p.key) || byKey.set(p.key, []).get(p.key)!).push(p);
  for (const [k, list] of byKey) {
    if (list.length < 2) continue;
    const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const c = { lat: med(list.map(p => p.lat)), lng: med(list.map(p => p.lng)) };
    const near = list.filter(p => haversine(p, c) <= 150);
    if (near.length >= 2) res.set(k, { lat: near.reduce((a, p) => a + p.lat, 0) / near.length, lng: near.reduce((a, p) => a + p.lng, 0) / near.length, source: "learned", n: near.length });
  }
  return res;
}

function scoreVisit(v: EVisit) {
  const flags: Flag[] = [];
  if (v.status === "cancelled") return { score: null, band: null, parts: { location: 0, content: 0, outcome: 0, plan: 0 }, flags };
  let loc = 0;
  const hasGps = v.lat !== null && v.lng !== null;
  if (!hasGps) flags.push({ code: "no_gps", label: "من غير موقع GPS", tone: "amber" });
  else if (v.accuracy_m !== null && v.accuracy_m > ACC_OK) flags.push({ code: "weak_gps", label: `دقة الموقع ضعيفة (${Math.round(v.accuracy_m)}م)`, tone: "amber" });
  else loc += 10;
  const isBurst = v.burst_clinics >= 3;
  if (isBurst) flags.push({ code: "burst", label: `اتسجلت مع ${v.burst_size - 1} زيارات لـ ${v.burst_clinics - 1} عيادات تانية من نفس المكان خلال دقائق`, tone: "red" });
  else if (v.burst_size) { flags.push({ code: "rapid", label: "اتسجلت ورا زيارة لعيادة تانية من نفس المكان خلال دقائق", tone: "amber" }); if (hasGps) loc += 5; }
  else if (hasGps) loc += 10;
  if (v.distance_m !== null && v.distance_m > FAR_M) flags.push({ code: "far", label: `على بعد ${v.distance_m >= 1000 ? `${(v.distance_m / 1000).toFixed(1)} كم` : `${v.distance_m} م`} من موقع العيادة`, tone: "red" });
  else if (v.distance_m !== null && !isBurst) loc += 5; else if (hasGps && !isBurst) loc += 3;
  let content = 0;
  const notes = (v.notes || "").trim().length;
  content += notes >= 25 ? 12 : notes >= 8 ? 6 : 0;
  if (notes < 8) flags.push({ code: "no_notes", label: "من غير ملاحظات", tone: "amber" });
  content += v.presented.length >= 2 ? 18 : v.presented.length === 1 ? 14 : 0;
  if (!v.presented.length) flags.push({ code: "no_products", label: "مفيش منتجات اتعرضت", tone: "amber" });
  content += v.detail_sec >= 60 ? 15 : v.detail_sec >= 20 ? 8 : 0;
  const outcome = (v.samples + v.orders > 0 ? 8 : 0) + (v.follow_up_at || v.followups ? 7 : 0);
  const plan = v.planned ? 15 : 5;
  const score = Math.min(100, loc + content + outcome + plan);
  return { score, band: (score >= 75 ? "excellent" : score >= 50 ? "good" : "weak") as EVisit["band"], parts: { location: loc, content, outcome, plan }, flags };
}

export type VFilter = { from: string; to: string; repId?: string; doctorId?: string; q?: string; cls?: string; productId?: string; reaction?: string; planned?: string; band?: string; flag?: string; status?: string; visitId?: string };

/** All visits in the window, enriched + scored. Burst/location analysis always sees the rep's full day(s). */
export async function enrichedVisits(f: VFilter): Promise<EVisit[]> {
  const vals: unknown[] = [f.from, f.to]; let extra = "";
  if (f.repId && UUID_RE.test(f.repId)) { vals.push(f.repId); extra += ` AND v.sales_rep_id=$${vals.length}`; }
  const rows = (await query(`
    SELECT v.id::text id, v.visited_at, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day, to_char(v.visited_at AT TIME ZONE 'Asia/Riyadh','HH24:MI') hm,
      v.status::text status, COALESCE(v.notes,'') notes, v.lat, v.lng, v.accuracy_m, v.follow_up_at::text follow_up_at, v.follow_up_note,
      v.sales_rep_id::text rep_id, u.name rep_name, d.id::text doctor_id, d.name doctor_name, COALESCE(d.clinic_name,'') clinic_name, d.clinic_id::text clinic_id, COALESCE(d.city,'') city, d.classification, d.specialty,
      COALESCE((SELECT json_agg(json_build_object('product_id',pp.product_id,'name',pr.name,'reaction',COALESCE(pp.reaction,''))) FROM visit_presented_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.visit_id=v.id),'[]'::json) presented,
      (SELECT count(*) FROM visit_items vi WHERE vi.visit_id=v.id AND vi.kind='sample')::int samples,
      (SELECT count(*) FROM visit_items vi WHERE vi.visit_id=v.id AND vi.kind='order')::int orders,
      (SELECT count(*) FROM doctor_followups df WHERE df.visit_id=v.id)::int followups,
      (SELECT count(*) FROM visit_attachments va WHERE va.visit_id=v.id)::int attachments,
      COALESCE((SELECT sum(s.seconds) FROM detailing_sessions s WHERE s.rep_id=v.sales_rep_id AND s.doctor_id=v.doctor_id AND (s.started_at AT TIME ZONE 'Asia/Riyadh')::date=(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date),0)::int detail_sec,
      EXISTS(SELECT 1 FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id=v.sales_rep_id AND pi.doctor_id=v.doctor_id AND pi.planned_date=(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date AND p.status::text<>'rejected') planned,
      r.rating, r.comment review_comment
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id LEFT JOIN visit_reviews r ON r.visit_id=v.id
    WHERE v.visited_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Riyadh') AND v.visited_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh') ${extra}
    ORDER BY v.visited_at DESC LIMIT 3000`, vals)).rows as Array<Record<string, any>>;
  if (!rows.length) return [];
  const reps = [...new Set(rows.map(r => r.rep_id))];
  const hist = (await query(`SELECT v.id::text id, v.sales_rep_id::text rep, d.id::text doctor_id, d.clinic_id::text clinic_id, d.clinic_name, v.visited_at, v.lat, v.lng, v.accuracy_m
    FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE v.lat IS NOT NULL AND v.lng IS NOT NULL AND v.status::text<>'cancelled' AND v.visited_at > now() - interval '365 days' AND v.sales_rep_id = ANY($1::uuid[])`, [reps])).rows as Array<Record<string, any>>;
  const pts: Pt[] = hist.map(h => ({ id: h.id, rep: h.rep, key: clinicKey(h.clinic_id, h.clinic_name, h.doctor_id), t: new Date(h.visited_at).getTime(), lat: h.lat, lng: h.lng, acc: h.accuracy_m }));
  const bursts = findBursts(pts);
  const keys = [...new Set(rows.map(r => clinicKey(r.clinic_id, r.clinic_name, r.doctor_id)))];
  const locs = await clinicLocations(keys, pts, bursts);
  let out: EVisit[] = rows.map(r => {
    const key = clinicKey(r.clinic_id, r.clinic_name, r.doctor_id);
    const loc = locs.get(key) || null;
    const b = bursts.get(r.id);
    const v = { ...r, clinic_key: key, presented: r.presented || [], burst_size: b?.size || 0, burst_clinics: b?.clinics || 0, clinic_loc: loc,
      distance_m: loc && r.lat !== null && r.lng !== null ? Math.round(haversine({ lat: r.lat, lng: r.lng }, loc)) : null } as EVisit;
    return { ...v, ...scoreVisit(v) };
  });
  // In-memory filters (need computed fields).
  const q = (f.q || "").trim().toLowerCase();
  out = out.filter(v =>
    (!f.visitId || v.id === f.visitId) &&
    (!f.doctorId || v.doctor_id === f.doctorId) &&
    (!q || `${v.doctor_name} ${v.clinic_name} ${v.city} ${v.notes} ${v.rep_name}`.toLowerCase().includes(q)) &&
    (!f.cls || (v.classification || "").toUpperCase() === f.cls.toUpperCase()) &&
    (!f.productId || v.presented.some(p => p.product_id === f.productId)) &&
    (!f.reaction || v.presented.some(p => p.reaction === f.reaction)) &&
    (!f.planned || (f.planned === "yes" ? v.planned : !v.planned)) &&
    (!f.band || v.band === f.band) &&
    (!f.flag || (f.flag === "any" ? v.flags.some(x => x.tone === "red") : v.flags.some(x => x.code === f.flag))) &&
    (!f.status || (f.status === "active" ? v.status !== "cancelled" : v.status === f.status)));
  return out;
}

export function summarize(vs: EVisit[]) {
  const act = vs.filter(v => v.status !== "cancelled");
  const scored = act.filter(v => v.score !== null);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const pres = act.flatMap(v => v.presented);
  const kpi = {
    visits: act.length, cancelled: vs.length - act.length, doctors: new Set(act.map(v => v.doctor_id)).size, clinics: new Set(act.map(v => v.clinic_key)).size,
    avgQuality: avg(scored.map(v => v.score!)), plannedPct: act.length ? Math.round(act.filter(v => v.planned).length / act.length * 100) : 0,
    redFlags: act.filter(v => v.flags.some(f => f.tone === "red")).length, bursts: act.filter(v => v.burst_clinics >= 3).length, far: act.filter(v => v.flags.some(f => f.code === "far")).length,
    samples: act.reduce((a, v) => a + v.samples, 0), orders: act.reduce((a, v) => a + v.orders, 0), followups: act.filter(v => v.follow_up_at || v.followups).length,
    presented: pres.length, positivePct: pres.length ? Math.round(pres.filter(p => p.reaction === "interested").length / pres.length * 100) : 0,
    detailMin: Math.round(act.reduce((a, v) => a + v.detail_sec, 0) / 60), reviewed: act.filter(v => v.rating).length,
  };
  const bands = { excellent: scored.filter(v => v.band === "excellent").length, good: scored.filter(v => v.band === "good").length, weak: scored.filter(v => v.band === "weak").length };
  const repMap = new Map<string, { rep_id: string; rep_name: string; visits: number; doctors: Set<string>; q: number[]; planned: number; red: number; samples: number; pres: number; pos: number; detail: number }>();
  for (const v of act) {
    const r = repMap.get(v.rep_id) || repMap.set(v.rep_id, { rep_id: v.rep_id, rep_name: v.rep_name, visits: 0, doctors: new Set(), q: [], planned: 0, red: 0, samples: 0, pres: 0, pos: 0, detail: 0 }).get(v.rep_id)!;
    r.visits++; r.doctors.add(v.doctor_id); if (v.score !== null) r.q.push(v.score); if (v.planned) r.planned++; if (v.flags.some(f => f.tone === "red")) r.red++;
    r.samples += v.samples; r.pres += v.presented.length; r.pos += v.presented.filter(p => p.reaction === "interested").length; r.detail += v.detail_sec;
  }
  const reps = [...repMap.values()].map(r => ({ rep_id: r.rep_id, rep_name: r.rep_name, visits: r.visits, doctors: r.doctors.size, avgQuality: avg(r.q), plannedPct: r.visits ? Math.round(r.planned / r.visits * 100) : 0, redFlags: r.red, samples: r.samples, positivePct: r.pres ? Math.round(r.pos / r.pres * 100) : 0, detailMin: Math.round(r.detail / 60) }))
    .sort((a, b) => b.avgQuality - a.avgQuality || b.visits - a.visits);
  const prodMap = new Map<string, { product_id: string; name: string; total: number; interested: number; neutral: number; other: number; reps: Set<string> }>();
  for (const v of act) for (const p of v.presented) {
    const x = prodMap.get(p.product_id) || prodMap.set(p.product_id, { product_id: p.product_id, name: p.name, total: 0, interested: 0, neutral: 0, other: 0, reps: new Set() }).get(p.product_id)!;
    x.total++; x.reps.add(v.rep_id); if (p.reaction === "interested") x.interested++; else if (p.reaction === "neutral") x.neutral++; else x.other++;
  }
  const products = [...prodMap.values()].map(p => ({ ...p, reps: p.reps.size, positivePct: Math.round(p.interested / p.total * 100) })).sort((a, b) => b.total - a.total);
  const dayMap = new Map<string, { day: string; visits: number; q: number[] }>();
  for (const v of act) { const d = dayMap.get(v.day) || dayMap.set(v.day, { day: v.day, visits: 0, q: [] }).get(v.day)!; d.visits++; if (v.score !== null) d.q.push(v.score); }
  const days = [...dayMap.values()].map(d => ({ day: d.day, visits: d.visits, avgQuality: avg(d.q) })).sort((a, b) => a.day.localeCompare(b.day));
  const cls: Record<string, number> = {}; for (const v of act) { const c = (v.classification || "—").toUpperCase(); cls[c] = (cls[c] || 0) + 1; }
  return { kpi, bands, reps, products, days, classes: cls };
}

/** Plan adherence per rep for the window (planned items vs. those with a visit that day). */
export async function planAdherence(from: string, to: string, repId?: string) {
  const vals: unknown[] = [from, to]; let w = "";
  if (repId && UUID_RE.test(repId)) { vals.push(repId); w = ` AND p.user_id=$3`; }
  const r = await query(`SELECT p.user_id::text rep_id, count(*)::int planned,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM visits v WHERE v.sales_rep_id=p.user_id AND v.doctor_id=pi.doctor_id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date AND v.status::text<>'cancelled'))::int done
    FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.status::text='approved' AND pi.planned_date BETWEEN $1::date AND $2::date ${w} GROUP BY 1`, vals);
  return r.rows as Array<{ rep_id: string; planned: number; done: number }>;
}

/** Live view: every active rep's day so far. */
export async function todayBoard() {
  const t = riyadhToday();
  const [vs, reps, adh, todo] = await Promise.all([
    enrichedVisits({ from: t, to: t }),
    query(`SELECT id::text id, name FROM users WHERE role='sales_rep' AND active ORDER BY name`),
    planAdherence(t, t),
    query(`SELECT p.user_id::text rep_id, json_agg(json_build_object('doctor_id',pi.doctor_id,'doctor_name',d.name,'clinic',d.clinic_name,'classification',d.classification) ORDER BY pi.sort_order) items
      FROM plan_items pi JOIN plans p ON p.id=pi.plan_id JOIN doctors d ON d.id=pi.doctor_id WHERE p.status::text='approved' AND pi.planned_date=$1::date GROUP BY 1`, [t]),
  ]);
  const now = Date.now();
  const board = (reps.rows as Array<{ id: string; name: string }>).map(r => {
    const mine = vs.filter(v => v.rep_id === r.id && v.status !== "cancelled").sort((a, b) => a.hm.localeCompare(b.hm));
    const a = adh.find(x => x.rep_id === r.id) || { planned: 0, done: 0 };
    const planList = ((todo.rows as Array<{ rep_id: string; items: Array<Record<string, string>> }>).find(x => x.rep_id === r.id)?.items || []).map(i => ({ ...i, done: mine.some(v => v.doctor_id === i.doctor_id) }));
    const last = mine[mine.length - 1];
    const sinceMin = last ? Math.round((now - new Date(last.visited_at).getTime()) / 60000) : null;
    const scores = mine.filter(v => v.score !== null).map(v => v.score!);
    const red = mine.filter(v => v.flags.some(f => f.tone === "red")).length;
    const state = !mine.length ? "idle" : a.planned > 0 && a.done >= a.planned ? "done" : sinceMin !== null && sinceMin > 180 ? "paused" : "active";
    return { rep_id: r.id, rep_name: r.name, state, planned: a.planned, done: a.done, visits: mine.length, sinceMin, first: mine[0]?.hm || null, last: last?.hm || null,
      avgQuality: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null, redFlags: red,
      timeline: mine.map(v => ({ id: v.id, hm: v.hm, doctor: v.doctor_name, score: v.score, band: v.band, red: v.flags.some(f => f.tone === "red"), planned: v.planned })), plan: planList };
  });
  const order: Record<string, number> = { active: 0, paused: 1, done: 2, idle: 3 };
  board.sort((a, b) => order[a.state] - order[b.state] || b.visits - a.visits);
  return { date: t, summary: summarize(vs).kpi, planned: adh.reduce((x, y) => x + y.planned, 0), done: adh.reduce((x, y) => x + y.done, 0), board };
}

/** Everything about one visit (the 360° panel). */
export async function visitDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const base = (await query(`SELECT sales_rep_id::text rep, (visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day, doctor_id::text doctor_id, visited_at FROM visits WHERE id=$1`, [id])).rows[0];
  if (!base) return null;
  const dayVisits = await enrichedVisits({ from: base.day, to: base.day, repId: base.rep });
  const v = dayVisits.find(x => x.id === id); if (!v) return null;
  const [items, views, fups, prev, atts, plan] = await Promise.all([
    query(`SELECT vi.kind::text kind, vi.quantity, vi.approval_status, vi.sample_purpose, p.name product_name FROM visit_items vi JOIN products p ON p.id=vi.product_id WHERE vi.visit_id=$1 ORDER BY vi.kind, p.name`, [id]),
    query(`SELECT p.name product_name, dv.page, dv.seconds, COALESCE(dv.reaction,'') reaction FROM detailing_sessions s JOIN detailing_views dv ON dv.session_id=s.id LEFT JOIN products p ON p.id=dv.product_id
      WHERE s.rep_id=$1 AND s.doctor_id=$2 AND (s.started_at AT TIME ZONE 'Asia/Riyadh')::date=$3::date ORDER BY p.name, dv.page`, [v.rep_id, v.doctor_id, v.day]),
    query(`SELECT title, note, due_at::text due_at, status, completed_at FROM doctor_followups WHERE visit_id=$1 ORDER BY due_at`, [id]),
    query(`SELECT v.id::text id, v.visited_at, u.name rep_name, COALESCE(v.notes,'') notes,
        COALESCE((SELECT string_agg(pr.name, '، ') FROM visit_presented_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.visit_id=v.id),'') products
      FROM visits v JOIN users u ON u.id=v.sales_rep_id WHERE v.doctor_id=$1 AND v.visited_at < $2 AND v.status::text<>'cancelled' ORDER BY v.visited_at DESC LIMIT 3`, [v.doctor_id, base.visited_at]),
    query(`SELECT id::text id, file_name, mime_type, size_bytes FROM visit_attachments WHERE visit_id=$1 ORDER BY created_at`, [id]),
    query(`SELECT p.id::text id, p.status::text status, p.period::text period FROM plan_items pi JOIN plans p ON p.id=pi.plan_id WHERE p.user_id=$1 AND pi.doctor_id=$2 AND pi.planned_date=$3::date AND p.status::text<>'rejected' LIMIT 1`, [v.rep_id, v.doctor_id, v.day]),
  ]);
  // Did the visit's follow-up actually happen (a later visit to the same doctor)?
  let followDone: boolean | null = null;
  if (v.follow_up_at) followDone = !!(await query(`SELECT 1 FROM visits WHERE doctor_id=$1 AND visited_at > $2 AND status::text<>'cancelled' LIMIT 1`, [v.doctor_id, base.visited_at])).rowCount;
  const review = (await query(`SELECT r.rating, r.comment, r.updated_at, u.name reviewer FROM visit_reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.visit_id=$1`, [id])).rows[0] || null;
  const day = dayVisits.filter(x => x.status !== "cancelled").sort((a, b) => a.hm.localeCompare(b.hm)).map(x => ({ id: x.id, hm: x.hm, doctor_name: x.doctor_name, clinic_name: x.clinic_name, score: x.score, band: x.band, red: x.flags.some(f => f.tone === "red") }));
  return { visit: v, items: items.rows, views: views.rows, followups: fups.rows, followDone, previous: prev.rows, attachments: atts.rows, plan: plan.rows[0] || null, review, day };
}
