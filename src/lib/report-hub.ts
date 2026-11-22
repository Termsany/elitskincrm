import { query } from "@/lib/db";
import { computeFinance, loadInput, type Input } from "@/lib/finance";
import { systemPulse } from "@/lib/system-pulse";
import { repScores } from "@/lib/rep-score";
import { PART_AR } from "@/lib/rep-score-core";
import { decliningClients } from "@/lib/clinic-account";
import { reorderDue } from "@/lib/smart";
import { addDays } from "@/lib/fmt";

/**
 * The decision reports: one loader per view (summary, sales, reps, market, money), all on the same filters.
 * Sales splits come from daftra_sales_v (credited to reps by product); profit, collection and costs from the Daftra mirror (company level).
 * The sales manager gets summary/reps/market without company money (see lib/manager-scope).
 */
export type View = "summary" | "sales" | "reps" | "market" | "money";
export const VIEWS: View[] = ["summary", "reps", "market"];
export const MONEY_VIEWS: View[] = ["sales", "money"];
export const ALL_VIEWS: View[] = ["summary", "sales", "reps", "market", "money"];
export type HubFilters = { from: string; to: string; repId: string; city: string };
export type Tone = "good" | "warn" | "bad" | "info";
export type Kpi = { id: string; label: string; value: number; unit: "sar" | "n" | "pct"; prev: number | null; target: number | null; tone: Tone; view: View };
export type Decision = { level: "danger" | "warn"; text: string; detail: string; href: string; weight: number };

const r0 = (n: number) => Math.round(n || 0);
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : null;
const delta = (a: number, b: number | null) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;
const span = (f: HubFilters) => Math.round((Date.parse(`${f.to}T00:00:00Z`) - Date.parse(`${f.from}T00:00:00Z`)) / 864e5) + 1;
export const prevOf = (f: HubFilters): HubFilters => ({ ...f, from: addDays(f.from, -span(f)), to: addDays(f.from, -1) });
const money = (n: number) => `${r0(n).toLocaleString("en-US")} ر.س`;
const toneUp = (d: number | null): Tone => d === null ? "info" : d >= 0 ? "good" : d >= -15 ? "warn" : "bad";

let cache: { at: number; inp: Input } | null = null;
/** Daftra mirror, cached for a minute (one page load asks several views). */
async function input(today: string) {
  if (cache && Date.now() - cache.at < 60_000 && cache.inp.today === today) return cache.inp;
  const inp = await loadInput(today); cache = { at: Date.now(), inp }; return inp;
}

/** Sales from daftra_sales_v grouped by one dimension, for the period and the one before it, with the filters applied. */
async function salesBy(dim: "rep" | "city" | "client" | "item" | "month", f: HubFilters) {
  const p = prevOf(f);
  const key = { rep: "COALESCE(u.name,'بدون مندوب')", city: "COALESCE(NULLIF(btrim(c.city),''),'بدون مدينة')", client: "COALESCE(c.name, s.client_name)", item: "s.item", month: "to_char(s.invoice_date,'YYYY-MM')" }[dim];
  const extra = dim === "rep" ? ", s.rep_id::text id" : dim === "client" ? ", max(COALESCE(NULLIF(btrim(c.city),''),'')) city, max(s.clinic_id::text) clinic_id" : "";
  const vals: unknown[] = [p.from, f.to, f.from]; const where: string[] = ["s.invoice_date BETWEEN $1::date AND $2::date"];
  if (f.repId) { vals.push(f.repId); where.push(`s.rep_id = $${vals.length}::uuid`); }
  if (f.city) { vals.push(f.city.trim().toLowerCase()); where.push(`lower(btrim(COALESCE(c.city,''))) = $${vals.length}`); }
  const r = await query<{ k: string; cur: number; prev: number; qty: number; id?: string; city?: string; clinic_id?: string }>(`
    SELECT ${key} k${extra}, COALESCE(sum(s.value) FILTER (WHERE s.invoice_date >= $3::date),0)::float8 cur, COALESCE(sum(s.value) FILTER (WHERE s.invoice_date < $3::date),0)::float8 prev,
      COALESCE(sum(s.quantity) FILTER (WHERE s.invoice_date >= $3::date),0)::float8 qty
    FROM daftra_sales_v s LEFT JOIN clinics c ON c.id = s.clinic_id LEFT JOIN users u ON u.id = s.rep_id
    WHERE ${where.join(" AND ")} GROUP BY ${dim === "rep" ? "1, s.rep_id" : "1"} ORDER BY 2 DESC NULLS LAST`, vals).catch(() => ({ rows: [] }));
  return r.rows.map(x => ({ ...x, cur: r0(x.cur), prev: r0(x.prev), qty: Math.round(x.qty * 10) / 10, delta: delta(x.cur, x.prev) }));
}

/** Last 12 months of sales (filters applied) and, company-wide, profit. */
async function trend(f: HubFilters, inp: Input | null) {
  const from = `${addDays(`${f.to.slice(0, 7)}-01`, -330).slice(0, 7)}-01`;
  const s = await salesBy("month", { ...f, from, to: f.to });
  const fin = inp && !f.repId && !f.city ? computeFinance(inp, from, f.to).monthly as Array<Record<string, number | string>> : [];
  const fm = new Map(fin.map(m => [String(m.m), m]));
  return s.map(x => ({ month: x.k, sales: x.cur, net: fm.has(x.k) ? r0(Number(fm.get(x.k)!.sales) - Number(fm.get(x.k)!.cogs) - Number(fm.get(x.k)!.opex) + Number(fm.get(x.k)!.other || 0)) : null }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function aUnseen(f: HubFilters) {
  const vals: unknown[] = [f.from, f.to]; let w = "";
  if (f.city) { vals.push(f.city.trim().toLowerCase()); w = `AND lower(btrim(COALESCE(d.city,''))) = $3`; }
  return (await query<{ city: string; a: number; seen: number }>(`SELECT COALESCE(NULLIF(btrim(d.city),''),'بدون مدينة') city, count(*)::int a,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1::date AND $2::date))::int seen
    FROM doctors d WHERE d.status='active' AND upper(COALESCE(d.classification,''))='A' ${w} GROUP BY 1 ORDER BY count(*) DESC`, vals)).rows;
}

/** Visits and doctors per city for the period. */
async function cities(f: HubFilters) {
  const vals: unknown[] = [f.from, f.to]; let rep = "";
  if (f.repId) { vals.push(f.repId); rep = `AND v.sales_rep_id = $3::uuid`; }
  return (await query<{ city: string; doctors: number; visited: number; visits: number }>(`SELECT COALESCE(NULLIF(btrim(d.city),''),'بدون مدينة') city, count(DISTINCT d.id)::int doctors,
      count(DISTINCT v.doctor_id)::int visited, count(v.id)::int visits
    FROM doctors d LEFT JOIN visits v ON v.doctor_id=d.id AND v.status::text IN ('completed','follow_up') AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1::date AND $2::date ${rep}
    WHERE d.status='active' GROUP BY 1 ORDER BY 2 DESC`, vals)).rows;
}

export async function hubSummary(f: HubFilters, today: string, manager: boolean) {
  const inp = manager ? null : await input(today).catch(() => null);
  const fin = inp?.sales.length ? computeFinance(inp, f.from, f.to) : null, finP = fin && inp ? computeFinance(inp, prevOf(f).from, prevOf(f).to) : null;
  const [pulse, scores, unseen, decl, pend] = await Promise.all([
    systemPulse(f.from, f.to, f.repId || null, today),
    repScores(f.to.slice(0, 7), today).catch(() => null),
    aUnseen(f),
    decliningClients(f.repId || null, today).catch(() => []),
    query<{ n: number }>("SELECT count(*)::int n FROM plans WHERE status='pending'").then(r => r.rows[0]?.n || 0).catch(() => 0),
  ]);
  const c = pulse.cards;
  const sc = (scores?.rows || []).filter(r => r.score !== null && (!f.repId || r.rep_id === f.repId));
  const avg = sc.length ? Math.round(sc.reduce((s, r) => s + r.score!, 0) / sc.length) : 0;
  const avgPrev = sc.filter(r => r.prev !== null).length ? Math.round(sc.filter(r => r.prev !== null).reduce((s, r) => s + r.prev!, 0) / sc.filter(r => r.prev !== null).length) : null;
  const aTot = unseen.reduce((s, x) => s + x.a, 0), aSeen = unseen.reduce((s, x) => s + x.seen, 0);
  const kpis: Kpi[] = [
    { id: "sales", label: "المبيعات", value: c.sales.value, unit: "sar", prev: c.sales.prev, target: c.sales.target || null, tone: c.sales.tone, view: "reps" },
    ...(fin && !f.repId && !f.city ? [{ id: "net", label: "صافي الربح", value: r0(fin.kpi.net), unit: "sar" as const, prev: finP ? r0(finP.kpi.net) : null, target: null, tone: (fin.kpi.net < 0 ? "bad" : toneUp(delta(fin.kpi.net, finP?.kpi.net ?? null))) as Tone, view: "summary" as View },
      { id: "collected", label: "التحصيل", value: r0(fin.kpi.collected), unit: "sar" as const, prev: finP ? r0(finP.kpi.collected) : null, target: null, tone: toneUp(delta(fin.kpi.collected, finP?.kpi.collected ?? null)), view: "summary" as View }] : []),
    { id: "visits", label: "الزيارات", value: c.visits.value, unit: "n", prev: c.visits.prev, target: null, tone: c.visits.tone, view: "reps" },
    { id: "a", label: "تغطية أطباء A", value: pct(aSeen, aTot) ?? 0, unit: "pct", prev: null, target: 100, tone: (pct(aSeen, aTot) ?? 0) >= 80 ? "good" : (pct(aSeen, aTot) ?? 0) >= 60 ? "warn" : "bad", view: "market" },
    { id: "score", label: "تقييم الفريق", value: avg, unit: "n", prev: avgPrev, target: 100, tone: avg >= 80 ? "good" : avg >= 60 ? "warn" : "bad", view: "reps" },
  ];
  const d: Decision[] = [];
  for (const t of pulse.team) if (t.target > 0 && t.sales_pct !== null && t.sales_pct < 75)
    d.push({ level: t.sales_pct < 50 ? "danger" : "warn", text: `${t.name} محقق ${t.sales_pct}% بس من تارجته`, detail: `${money(t.sales)} من ${money(t.target)}`, href: `/admin/reports?view=reps&repId=${t.id}`, weight: t.target - t.sales });
  for (const x of decl.slice(0, 6)) d.push({ level: x.status === "stopped" ? "danger" : "warn", text: x.status === "stopped" ? `${x.name} بطّل يطلب من ${x.days_since} يوم` : `${x.name} بيطلب أقل بـ ${Math.abs(Math.round(x.change ?? 0))}%`,
    detail: `متوسطه ${money(x.monthly_avg)} في الشهر${x.rep_name ? ` · ${x.rep_name}` : ""}`, href: x.doctor_id ? `/doctors/${x.doctor_id}` : "/admin/reports?view=market", weight: x.monthly_avg * (x.status === "stopped" ? 3 : 2) });
  if (fin && fin.price_guard.below_cost) d.push({ level: "danger", text: `${fin.price_guard.below_cost} سطر اتباع تحت التكلفة`, detail: `خسارة ${money(fin.price_guard.real_loss)} في الفترة`, href: "https://finance.eliteskinsa.com", weight: fin.price_guard.real_loss * 3 });
  const old = fin ? Number(fin.ar.buckets["90+"] || 0) : 0;
  if (old > 0) d.push({ level: "danger", text: `${money(old)} ديون عدّت 90 يوم`, detail: `من إجمالي ${money(fin!.ar.total)} مستحق · افتح في المالية`, href: "https://finance.eliteskinsa.com", weight: old });
  if (aTot && aTot - aSeen > 0) d.push({ level: aSeen / aTot < 0.6 ? "danger" : "warn", text: `${aTot - aSeen} طبيب A محدش زارهم في الفترة`, detail: unseen.filter(x => x.a > x.seen).slice(0, 3).map(x => `${x.city} ${x.a - x.seen}`).join(" · "), href: "/plans?tab=map", weight: (aTot - aSeen) * 500 });
  for (const r of sc.filter(r => r.score! < 50)) d.push({ level: "warn", text: `تقييم ${r.name} ${r.score}/100`, detail: r.lift ? `أضعف بند: ${PART_AR[r.lift]}` : "", href: "/plans?tab=score", weight: (50 - r.score!) * 300 });
  if (pend) d.push({ level: "warn", text: `${pend} خطة مستنية اعتمادك`, detail: "", href: "/plans", weight: pend * 1000 });
  if (c.expenses.pending_n && !manager) d.push({ level: "warn", text: `${c.expenses.pending_n} مصروف مستني موافقتك`, detail: money(c.expenses.pending), href: "/expenses", weight: c.expenses.pending });
  return { kpis, decisions: d.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1) || b.weight - a.weight).slice(0, 5), more: Math.max(0, d.length - 5) };
}

export async function hubSales(f: HubFilters, today: string) {
  const inp = await input(today).catch(() => null);
  const company = !f.repId && !f.city && !!inp?.sales.length;
  const fin = company ? computeFinance(inp!, f.from, f.to) : null, finP = fin ? computeFinance(inp!, prevOf(f).from, prevOf(f).to) : null;
  const [byRep, byCity, byClient, byItem, tr] = await Promise.all([salesBy("rep", f), salesBy("city", f), salesBy("client", f), salesBy("item", f), trend(f, company ? inp : null)]);
  const margin = new Map((fin?.salesByProduct || []).map(p => [p.name.trim().toLowerCase(), p]));
  const total = byItem.reduce((s, x) => s + x.cur, 0), totalPrev = byItem.reduce((s, x) => s + x.prev, 0);
  return {
    totals: { sales: total, prev: totalPrev, delta: delta(total, totalPrev),
      ...(fin ? { gross: r0(fin.kpi.gross), gross_margin: fin.kpi.gross_margin, opex: r0(fin.kpi.opex), net: r0(fin.kpi.net), net_margin: fin.kpi.net_margin, net_prev: r0(finP!.kpi.net), invoices: fin.kpi.invoices, clients: fin.kpi.clients } : {}) },
    trend: tr,
    byItem: byItem.map(x => { const m = margin.get(x.k.trim().toLowerCase()); return { name: x.k, sales: x.cur, prev: x.prev, delta: x.delta, qty: x.qty, gross: m ? r0(m.gross) : null, margin: m?.margin ?? null }; }),
    byRep: byRep.map(x => ({ id: x.id || "", name: x.k, sales: x.cur, prev: x.prev, delta: x.delta })),
    byCity: byCity.map(x => ({ name: x.k, sales: x.cur, prev: x.prev, delta: x.delta })),
    clients: byClient.map(x => ({ name: x.k, city: x.city || "", clinic_id: x.clinic_id || "", sales: x.cur, prev: x.prev, delta: x.delta })),
    losses: (fin?.price_guard.lines || []).filter(l => l.below_cost).slice(0, 40).map(l => ({ date: l.date, no: l.no, client: l.party, item: l.item, qty: l.qty, price: l.price, cost: l.cost, lost: r0((l.cost - l.price) * l.qty) })),
    company,
  };
}

export async function hubReps(f: HubFilters, today: string) {
  const [pulse, scores] = await Promise.all([systemPulse(f.from, f.to, null, today), repScores(f.to.slice(0, 7), today)]);
  const rows = pulse.team.filter(t => !f.repId || t.id === f.repId).map(t => {
    const s = scores.rows.find(x => x.rep_id === t.id);
    return { id: t.id, name: t.name, product: t.product, score: s?.score ?? null, prev_score: s?.prev ?? null, weakest: s?.lift ? PART_AR[s.lift] : null,
      sales: t.sales, target: t.target, sales_pct: t.sales_pct, visits: t.visits, visits_prev: t.visits_prev, planned: t.planned, plan_done: t.plan_done, plan_pct: t.plan_pct,
      a: s ? `${s.raw.aCovered}/${Math.round(s.raw.aRequired)}` : "—", quality: s?.parts.quality === null || !s ? null : Math.round(s.parts.quality * 100),
      cancelled: s?.raw.cancelled ?? 0, idle: s?.raw.idleDays ?? 0, overdue: t.overdue, expenses: t.expenses };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { month: scores.month, rows };
}

export async function hubMarket(f: HubFilters, today: string) {
  const [decl, due, unseen, cs, growth] = await Promise.all([
    decliningClients(f.repId || null, today).catch(() => []),
    reorderDue(today, { repId: f.repId || undefined, ahead: 10 }).catch(() => []),
    aUnseen(f), cities(f), salesBy("client", f),
  ]);
  const inCity = (c: string | null | undefined) => !f.city || (c || "").trim().toLowerCase() === f.city.trim().toLowerCase();
  const ids = [...new Set([...decl.map(x => x.clinic_id), ...due.map(x => x.clinic_id)].filter(Boolean))] as string[];
  const cityOf = new Map((ids.length ? (await query<{ id: string; city: string | null }>("SELECT id, city FROM clinics WHERE id = ANY($1::uuid[])", [ids])).rows : []).map(r => [r.id, r.city]));
  const here = (clinicId: string | null) => !f.city || (!!clinicId && inCity(cityOf.get(clinicId)));
  const csales = await salesBy("city", f);
  const sm = new Map(csales.map(x => [x.k, x]));
  return {
    declining: decl.filter(x => here(x.clinic_id)).map(x => ({ name: x.name, clinic: x.clinic_name, rep: x.rep_name, status: x.status, days: x.days_since, change: x.change, monthly: r0(x.monthly_avg), last: x.last, doctor_id: x.doctor_id })),
    reorder: due.filter(x => here(x.clinic_id)).map(x => ({ clinic: x.clinic_name, next: x.next_expected, days_to: x.days_to, gap: x.usual_gap, monthly: r0(x.monthly_avg), top: x.top.slice(0, 2).join("، "), doctor_id: x.doctors[0]?.id || "" })),
    cities: cs.filter(x => inCity(x.city)).map(x => { const u = unseen.find(y => y.city === x.city); const s = sm.get(x.city); return { city: x.city, doctors: x.doctors, visited: x.visited, coverage: pct(x.visited, x.doctors), visits: x.visits,
      a: u?.a ?? 0, a_unseen: u ? u.a - u.seen : 0, sales: s?.cur ?? 0, sales_delta: s?.delta ?? null }; }),
    growing: growth.filter(x => x.prev > 0 && x.cur > x.prev).sort((a, b) => (b.cur - b.prev) - (a.cur - a.prev)).slice(0, 10).map(x => ({ name: x.k, city: x.city || "", sales: x.cur, prev: x.prev, delta: x.delta })),
    newClients: growth.filter(x => !x.prev && x.cur > 0).slice(0, 10).map(x => ({ name: x.k, city: x.city || "", sales: x.cur })),
  };
}

export async function hubMoney(f: HubFilters, today: string) {
  const inp = await input(today);
  const fin = computeFinance(inp, f.from, f.to), finP = computeFinance(inp, prevOf(f).from, prevOf(f).to);
  const in30 = addDays(today, 30);
  const due = inp.sales.filter(d => d.unpaid > 0 && (d.payment_status === 0 || d.payment_status === 1)).map(d => ({ party: d.party, no: d.no, due: addDays(d.date, d.due_days || 0), unpaid: d.unpaid }));
  const year = computeFinance(inp, `${addDays(`${f.to.slice(0, 7)}-01`, -330).slice(0, 7)}-01`, f.to).monthly as Array<Record<string, number | string>>;
  return {
    kpi: { ar: r0(fin.ar.total), overdue: r0(fin.ar.overdue), collected: r0(fin.kpi.collected), collected_prev: r0(finP.kpi.collected), opex: r0(fin.kpi.opex), opex_prev: r0(finP.kpi.opex),
      sales: r0(fin.kpi.sales), expected_30: r0(due.filter(x => x.due <= in30 && x.due >= today).reduce((s, x) => s + x.unpaid, 0)), fixed_monthly: r0(fin.fixed_monthly), ap: r0(fin.ap.total) },
    buckets: fin.ar.buckets as Record<string, number>,
    debtors: fin.ar.parties.slice().sort((a, b) => b.overdue - a.overdue).slice(0, 40).map(p => ({ name: p.name, unpaid: r0(p.unpaid), overdue: r0(p.overdue), oldest: p.oldestDue, n: p.n })),
    upcoming: due.filter(x => x.due >= today && x.due <= in30).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 30).map(x => ({ ...x, unpaid: r0(x.unpaid) })),
    expenses: fin.expensesByAccount.filter(a => a.treatment === "opex").slice(0, 15).map(a => ({ name: a.name, amount: r0(a.amount) })),
    monthly: year.map(m => ({ month: String(m.m), sales: r0(Number(m.sales)), collected: r0(Number(m.collected)), opex: r0(Number(m.opex)) })),
  };
}

export async function reportHub(view: View, f: HubFilters, today: string, manager: boolean) {
  switch (view) {
    case "sales": return hubSales(f, today);
    case "reps": return hubReps(f, today);
    case "market": return hubMarket(f, today);
    case "money": return hubMoney(f, today);
    default: return hubSummary(f, today, manager);
  }
}
export type HubData = { summary: Awaited<ReturnType<typeof hubSummary>>; sales: Awaited<ReturnType<typeof hubSales>>; reps: Awaited<ReturnType<typeof hubReps>>; market: Awaited<ReturnType<typeof hubMarket>>; money: Awaited<ReturnType<typeof hubMoney>> };

const DAY = /^20\d\d-\d\d-\d\d$/;
const UUID = /^[0-9a-f-]{36}$/i;
/** Filters from a query string (defaults: this month to today). */
export function parseHub(sp: URLSearchParams, today: string): HubFilters {
  const from = sp.get("from") || "", to = sp.get("to") || "";
  const ok = DAY.test(from) && DAY.test(to) && from <= to;
  return { from: ok ? from : `${today.slice(0, 7)}-01`, to: ok ? to : today, repId: UUID.test(sp.get("repId") || "") ? sp.get("repId")! : "", city: (sp.get("city") || "").slice(0, 80) };
}
