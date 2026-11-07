import { query } from "@/lib/db";

import { riyadhToday } from "@/lib/riyadh-day";
export { riyadhToday };

/* ───────────────────────── Types ───────────────────────── */
export type Line = { product_id: number | null; item: string; quantity: number; net: number; tax: number };
export type Doc = { id: number; no: string; date: string; due_days: number; party_id: number | null; party: string; city: string; branch: string;
  payment_status: number; net: number; tax: number; total: number; paid: number; unpaid: number; refund: number; lines: Line[] };
export type Product = { id: number; name: string; code: string; list_price: number; buy_price: number; average_cost: number; min_price: number | null; stock: number; active: boolean };
export type Payment = { date: string; amount: number; client_id: number | null };
export type Entry = { id: number; kind: "expense" | "income"; date: string; amount: number; tax: number; account_id: number | null; vendor: string; note: string };
export type Account = { id: number; code: string; name: string };
export type Treatment = "opex" | "cogs" | "exclude";
export type Fixed = { id: string; name: string; category: string; monthly_amount: number; start_month: string; end_month: string | null; notes: string };
export type Settings = { target_gross_margin: number; target_net_margin: number; books_start?: string | null };
/** P&L, advice and audits only count from the books start date; receivables/payables keep every open document. */
export function clampRange(inp: Pick<Input, "settings">, from: string, to: string): [string, string] {
  const st = inp.settings.books_start || "";
  return [st && from < st ? st : from, to];
}
export type Input = { sales: Doc[]; purchases: Doc[]; products: Product[]; payments: Payment[]; entries: Entry[]; accounts: Account[]; overrides: Record<number, Treatment>; fixed: Fixed[]; settings: Settings; today: string };

/* ───────────────────────── helpers ───────────────────────── */
const r2 = (n: number) => Math.round(n * 100) / 100;
const month = (d: string) => d.slice(0, 7);
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const norm = (s: string) => s.toLowerCase().replace(/[\s\-_()]+/g, " ").replace(/\s+/g, " ").trim();
/** Share of a document still standing after refunds (fully refunded → 0). */
const keep = (d: Doc) => d.total > 0 ? Math.max(0, 1 - d.refund / d.total) : 1;
export function monthsBetween(from: string, to: string) { const out: string[] = []; let [y, m] = from.slice(0, 7).split("-").map(Number); const [ty, tm] = to.slice(0, 7).split("-").map(Number); while ((y < ty || (y === ty && m <= tm)) && out.length < 120) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (m === 12) { y++; m = 1; } else m++; } return out; }
export function bucket(daysPastDue: number) { return daysPastDue <= 0 ? "current" : daysPastDue <= 30 ? "1-30" : daysPastDue <= 60 ? "31-60" : daysPastDue <= 90 ? "61-90" : "90+"; }
export const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

/** Account treatment: explicit override, else chart-of-accounts code (51xx = cost of sales, 5xxx = operating expense, anything else — treasury, partner, VAT, custody, clients — is not a P&L expense). */
export function treatment(acc: Account | undefined, overrides: Record<number, Treatment>): Treatment {
  if (acc && overrides[acc.id]) return overrides[acc.id];
  if (!acc) return "opex";
  if (acc.code.startsWith("51")) return "cogs";
  if (acc.code.startsWith("5")) return "opex";
  return "exclude";
}

/** Weighted average purchase cost per product (net of VAT, after discounts and returns), with last purchase. */
export function costBasis(purchases: Doc[], products: Product[], upTo: string) {
  const byKey = new Map<string, { qty: number; net: number; last?: { date: string; unit: number; supplier: string } }>();
  const nameToId = new Map<string, number>(); for (const p of products) nameToId.set(norm(p.name), p.id);
  const keyOf = (l: Line) => l.product_id ? `p${l.product_id}` : nameToId.has(norm(l.item)) ? `p${nameToId.get(norm(l.item))}` : `n${norm(l.item)}`;
  for (const d of [...purchases].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.date > upTo) continue;
    const f = keep(d);
    for (const l of d.lines) {
      if (!(l.quantity > 0)) continue;
      const k = keyOf(l); const x = byKey.get(k) || { qty: 0, net: 0 };
      x.qty += l.quantity * f; x.net += l.net * f; x.last = { date: d.date, unit: l.net / l.quantity, supplier: d.party }; byKey.set(k, x);
    }
  }
  const cost = (l: Line): number | null => {
    const x = byKey.get(keyOf(l)); if (x && x.qty > 0 && x.net > 0) return x.net / x.qty;
    const p = l.product_id ? products.find(q => q.id === l.product_id) : products.find(q => norm(q.name) === norm(l.item));
    if (p && p.average_cost > 0) return p.average_cost; if (p && p.buy_price > 0) return p.buy_price; return null;
  };
  return { byKey, keyOf, cost };
}

/* ───────────────────────── Main engine ───────────────────────── */
export function computeFinance(inp: Input, from0: string, to: string) {
  const [from] = clampRange(inp, from0, to), booksStart = inp.settings.books_start || null;
  const inR = (d: string) => d >= from && d <= to;
  const months = monthsBetween(from, to);
  const accById = new Map(inp.accounts.map(a => [a.id, a]));
  const cb = costBasis(inp.purchases, inp.products, to);
  const M = new Map(months.map(m => [m, { m, sales: 0, cogs: 0, opex: 0, other: 0, purchases: 0, collected: 0, invoices: 0 }]));

  // ── sales & COGS
  const sales = inp.sales.filter(d => inR(d.date));
  const prod = new Map<string, { key: string; name: string; qty: number; net: number; cogs: number; costKnown: boolean; invoices: Set<number> }>();
  const clients = new Map<string, { name: string; city: string; net: number; n: number; last: string }>();
  let salesNet = 0, salesTax = 0, salesTotal = 0, refunds = 0, cogs = 0, knownNet = 0, lineNet = 0;
  const sold: Array<{ id: number; no: string; date: string; party: string; key: string; item: string; qty: number; price: number; cost: number | null }> = [];
  for (const d of sales) {
    const f = keep(d), mm = M.get(month(d.date));
    salesNet += d.net * f; salesTax += d.tax * f; salesTotal += d.total; refunds += d.refund;
    if (mm) { mm.sales += d.net * f; mm.invoices++; }
    const c = clients.get(d.party) || { name: d.party, city: d.city, net: 0, n: 0, last: "" }; c.net += d.net * f; c.n++; if (d.date > c.last) c.last = d.date; clients.set(d.party, c);
    for (const l of d.lines) {
      const k = cb.keyOf(l), unit = cb.cost(l), q = l.quantity * f, n = l.net * f;
      const p = prod.get(k) || { key: k, name: l.item, qty: 0, net: 0, cogs: 0, costKnown: true, invoices: new Set<number>() };
      p.qty += q; p.net += n; p.invoices.add(d.id); lineNet += n;
      if (f > 0 && l.quantity > 0 && l.net > 0) sold.push({ id: d.id, no: d.no, date: d.date, party: d.party, key: k, item: l.item, qty: q, price: l.net / l.quantity, cost: unit });
      if (unit !== null) { p.cogs += q * unit; cogs += q * unit; knownNet += n; if (mm) mm.cogs += q * unit; } else if (q > 0) p.costKnown = false;
      prod.set(k, p);
    }
  }

  // ── purchases
  const purchases = inp.purchases.filter(d => inR(d.date));
  const pprod = new Map<string, { key: string; name: string; qty: number; net: number }>();
  const suppliers = new Map<string, { name: string; net: number; total: number; n: number }>();
  let purNet = 0, purTax = 0, purTotal = 0;
  for (const d of purchases) {
    const f = keep(d); purNet += d.net * f; purTax += d.tax * f; purTotal += d.total * f;
    const mm = M.get(month(d.date)); if (mm) mm.purchases += d.net * f;
    const s = suppliers.get(d.party) || { name: d.party, net: 0, total: 0, n: 0 }; s.net += d.net * f; s.total += d.total * f; s.n++; suppliers.set(d.party, s);
    for (const l of d.lines) { const k = cb.keyOf(l); const p = pprod.get(k) || { key: k, name: l.item, qty: 0, net: 0 }; p.qty += l.quantity * f; p.net += l.net * f; pprod.set(k, p); }
  }

  // ── expenses / other income (Daftra), classified by chart of accounts
  const accAgg = new Map<string, { account_id: number | null; code: string; name: string; treatment: Treatment; amount: number; n: number }>();
  let opex = 0, cogsExtra = 0, other = 0, expTax = 0;
  const entries = inp.entries.filter(e => inR(e.date)).map(e => {
    const acc = e.account_id ? accById.get(e.account_id) : undefined;
    if (e.kind === "income") {
      const isOther = !!acc && acc.code.startsWith("42");
      if (isOther) { other += e.amount; const mm = M.get(month(e.date)); if (mm) mm.other += e.amount; }
      return { ...e, account: acc?.name || "—", code: acc?.code || "", treatment: (isOther ? "other_income" : "exclude") as string };
    }
    const t = treatment(acc, inp.overrides);
    const key = String(e.account_id ?? "none");
    const a = accAgg.get(key) || { account_id: e.account_id, code: acc?.code || "", name: acc?.name || "بدون حساب", treatment: t, amount: 0, n: 0 };
    a.amount += e.amount; a.n++; accAgg.set(key, a);
    const mm = M.get(month(e.date));
    if (t === "opex") { opex += e.amount; expTax += e.tax; if (mm) mm.opex += e.amount; }
    if (t === "cogs") { cogsExtra += e.amount; expTax += e.tax; if (mm) mm.cogs += e.amount; }
    return { ...e, account: acc?.name || "بدون حساب", code: acc?.code || "", treatment: t as string };
  });
  cogs += cogsExtra;
  const isMkt = (name: string) => /تسويق|دعاي|إعلان|اعلان|فعالي|معارض|marketing/i.test(name);
  const marketing = [...accAgg.values()].filter(a => a.treatment === "opex" && isMkt(a.name)).reduce((s, a) => s + a.amount, 0);

  // ── cash collected (customer payments)
  let collected = 0;
  for (const p of inp.payments) if (inR(p.date)) { collected += p.amount; const mm = M.get(month(p.date)); if (mm) mm.collected += p.amount; }

  // ── receivables / payables (as of today, all open documents)
  const ageBook = (docs: Doc[]) => {
    const parties = new Map<string, { name: string; unpaid: number; overdue: number; n: number; oldestDue: number; b: Record<string, number> }>();
    const totals: Record<string, number> = Object.fromEntries(BUCKETS.map(b => [b, 0]));
    const open: Array<{ id: number; no: string; date: string; party: string; unpaid: number; due: string; days: number }> = [];
    for (const d of docs) {
      if (!(d.unpaid > 0) || !(d.payment_status === 0 || d.payment_status === 1)) continue;
      const due = addDays(d.date, d.due_days), days = daysBetween(due, inp.today), bk = bucket(days);
      totals[bk] += d.unpaid; open.push({ id: d.id, no: d.no, date: d.date, party: d.party, unpaid: d.unpaid, due, days });
      const p = parties.get(d.party) || { name: d.party, unpaid: 0, overdue: 0, n: 0, oldestDue: 0, b: Object.fromEntries(BUCKETS.map(b => [b, 0])) };
      p.unpaid += d.unpaid; p.n++; p.b[bk] += d.unpaid; if (days > 0) p.overdue += d.unpaid; p.oldestDue = Math.max(p.oldestDue, days); parties.set(d.party, p);
    }
    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    return { total: r2(total), overdue: r2(total - totals.current), buckets: totals, parties: [...parties.values()].map(p => ({ ...p, unpaid: r2(p.unpaid), overdue: r2(p.overdue), b: Object.fromEntries(Object.entries(p.b).map(([k, v]) => [k, r2(v as number)])) as typeof p.b })).sort((a, b) => b.unpaid - a.unpaid), open: open.sort((a, b) => b.days - a.days) };
  };
  const ar = ageBook(inp.sales), ap = ageBook(inp.purchases);

  // ── month series
  const monthly = [...M.values()].map(m => ({ ...m, gross: m.sales - m.cogs, net: m.sales - m.cogs - m.opex + m.other }));

  // ── advisor baseline: last 12 complete months (sales are lumpy B2B — 6 months swings too much),
  //    trimmed to the first month the business has sales (stable regardless of the page filter)
  const curM = month(inp.today);
  const firstSale = inp.sales.reduce((m, d) => d.date && month(d.date) < m ? month(d.date) : m, curM);
  const firstM = booksStart && month(booksStart) > firstSale ? month(booksStart) : firstSale;
  let base = monthsBetween(shiftMonth(curM, -12), shiftMonth(curM, -1)).filter(m => m >= firstM);
  const baseFrom = `${base[0]}-01`, baseTo = addDays(`${curM}-01`, -1);
  // with a books start date one closed month is enough; before that, a provisional month-to-date average (≥ 7 days)
  let B = base.length >= (booksStart ? 1 : 3) && baseFrom <= baseTo ? computeCore(inp, baseFrom < (booksStart || "") ? booksStart! : baseFrom, baseTo) : null;
  let provisional = false;
  if (!B && booksStart && booksStart <= inp.today) {
    const days = daysBetween(booksStart, inp.today) + 1;
    if (days >= 7) { B = computeCore(inp, booksStart, inp.today, days / 30.44); base = [curM]; provisional = true; }
  }

  // ── products & pricing
  const lastSale = new Map<string, string>();
  for (const d of inp.sales) for (const l of d.lines) { const k = cb.keyOf(l); if (!lastSale.has(k) || lastSale.get(k)! < d.date) lastSale.set(k, d.date); }
  const opexRatio = B && B.sales > 0 ? Math.min(0.6, B.opex / B.sales) : 0;
  const tgtNet = inp.settings.target_net_margin / 100, tgtGross = inp.settings.target_gross_margin / 100;
  const keys = new Set<string>([...inp.products.filter(p => p.active).map(p => `p${p.id}`), ...prod.keys(), ...pprod.keys()]);
  const d90 = addDays(inp.today, -90), sold90 = new Map<string, number>();
  for (const d of inp.sales) if (d.date > d90 && d.date <= inp.today) { const f = keep(d); for (const l of d.lines) if (l.quantity > 0) { const k = cb.keyOf(l); sold90.set(k, (sold90.get(k) || 0) + l.quantity * f); } }
  const pricing = [...keys].map(k => {
    const pid = k.startsWith("p") ? Number(k.slice(1)) : null; const p = pid ? inp.products.find(x => x.id === pid) : undefined;
    const s = prod.get(k), pu = pprod.get(k), pc = cb.byKey.get(k);
    const unit = cb.cost({ product_id: pid, item: p?.name || s?.name || pu?.name || "", quantity: 1, net: 0, tax: 0 });
    const realized = s && s.qty > 0 ? s.net / s.qty : null;
    const breakeven = unit !== null ? unit / (1 - opexRatio) : null;
    const suggested = unit !== null ? unit / Math.max(0.1, 1 - Math.max(tgtGross, opexRatio + tgtNet)) : null;
    const margin = s && s.net > 0 && s.costKnown ? (s.net - s.cogs) / s.net : null;
    const last = lastSale.get(k) || null; const stock = p?.stock || 0;
    const status = unit === null ? "no_cost" : realized !== null && realized < unit ? "loss" : realized !== null && breakeven !== null && realized < breakeven ? "below_breakeven"
      : realized !== null && suggested !== null && realized >= suggested ? "healthy" : realized !== null ? "thin" : stock > 0 && (!last || daysBetween(last, inp.today) > 90) ? "dead_stock" : "no_sales";
    return { key: k, product_id: pid, name: p?.name || s?.name || pu?.name || "", code: p?.code || "", list_price: p?.list_price || 0, min_price: p?.min_price ?? null,
      avg_cost: unit === null ? null : r2(unit), last_cost: pc?.last ? r2(pc.last.unit) : null, last_cost_date: pc?.last?.date || null, last_supplier: pc?.last?.supplier || "",
      qty_sold: r2(s?.qty || 0), revenue: r2(s?.net || 0), cogs: r2(s?.cogs || 0), gross: r2((s?.net || 0) - (s?.cogs || 0)), margin: margin === null ? null : r2(margin * 100),
      realized_price: realized === null ? null : r2(realized), breakeven_price: breakeven === null ? null : r2(breakeven), suggested_price: suggested === null ? null : r2(suggested),
      qty_purchased: r2(pu?.qty || 0), purchased_value: r2(pu?.net || 0), stock, stock_value: unit === null ? null : r2(stock * unit), last_sale: last, status,
      ...stockCover(stock, sold90.get(k) || 0, p?.active !== false) };
  }).filter(x => x.name).sort((a, b) => b.revenue - a.revenue || b.purchased_value - a.purchased_value);

  // ── price guard: real Daftra sales below break-even / below cost (break-even = cost ÷ (1 − opex share))
  // floor = the price that keeps the target gross margin (admin-set, default 45%); below cost = selling at a loss
  const floorM = Math.min(0.9, Math.max(0, inp.settings.target_gross_margin / 100));
  const guard = sold.filter(x => x.cost !== null && x.cost > 0 && x.price < x.cost / (1 - floorM) - 0.005).map(x => {
    const be = x.cost! / (1 - floorM);
    return { id: x.id, no: x.no, date: x.date, party: x.party, key: x.key, item: x.item, qty: r2(x.qty), price: r2(x.price), cost: r2(x.cost!), breakeven: r2(be),
      below_cost: x.price < x.cost!, gap: r2(be - x.price), lost: r2((be - x.price) * x.qty) };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.lost - a.lost);
  const real_loss = r2(guard.filter(g => g.below_cost).reduce((s, g) => s + (g.cost - g.price) * g.qty, 0));
  const price_guard = { lines: guard, below_cost: guard.filter(g => g.below_cost).length, below_breakeven: guard.filter(g => !g.below_cost).length, lost: r2(guard.reduce((s, g) => s + g.lost, 0)), real_loss, floor_margin: r2(floorM * 100) };
  const stock_alerts = pricing.filter(p => ["negative", "out", "low"].includes(p.stock_status)).sort((a, b) => STOCK_RANK[a.stock_status] - STOCK_RANK[b.stock_status] || (a.months_cover ?? 0) - (b.months_cover ?? 0));

  // ── planning & advice
  const fixedMonthly = inp.fixed.filter(f => `${curM}-01` >= f.start_month.slice(0, 10) && (!f.end_month || `${curM}-01` <= f.end_month.slice(0, 10))).reduce((s, f) => s + f.monthly_amount, 0);
  const plan = planning(B, fixedMonthly, inp.settings);
  const advice = adviseAll({ B, plan, ar, ap, pricing, price_guard, stock_alerts, clients: [...clients.values()], salesNet, inp, opexRatio, coverage: lineNet ? knownNet / lineNet : 1, entries, monthly });

  const gross = salesNet - cogs, net = gross - opex + other;
  return {
    period: { from, to, months },
    kpi: { sales: r2(salesNet), sales_tax: r2(salesTax), sales_total: r2(salesTotal), refunds: r2(refunds), invoices: sales.length, clients: clients.size,
      cogs: r2(cogs), gross: r2(gross), gross_margin: salesNet ? r2(gross / salesNet * 100) : null, opex: r2(opex), marketing: r2(marketing), net_before_marketing: r2(net + marketing), other_income: r2(other), net: r2(net), net_margin: salesNet ? r2(net / salesNet * 100) : null,
      purchases: r2(purNet), purchases_tax: r2(purTax), purchases_total: r2(purTotal), purchase_invoices: purchases.length, collected: r2(collected),
      ar: ar.total, ar_overdue: ar.overdue, ap: ap.total, ap_overdue: ap.overdue,
      vat_out: r2(salesTax), vat_in: r2(purTax + expTax), vat_payable: r2(salesTax - purTax - expTax), cost_coverage: lineNet ? r2(knownNet / lineNet * 100) : 100 },
    monthly: monthly.map(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v]))),
    salesByProduct: [...prod.values()].map(p => ({ name: p.name, qty: r2(p.qty), net: r2(p.net), cogs: r2(p.cogs), gross: r2(p.net - p.cogs), margin: p.net > 0 && p.costKnown ? r2((p.net - p.cogs) / p.net * 100) : null, invoices: p.invoices.size, cost_known: p.costKnown })).sort((a, b) => b.net - a.net),
    salesByClient: [...clients.values()].map(c => ({ ...c, net: r2(c.net), share: salesNet ? r2(c.net / salesNet * 100) : 0 })).sort((a, b) => b.net - a.net),
    purchasesByProduct: [...pprod.values()].map(p => { const pc = cb.byKey.get(p.key); return { name: p.name, qty: r2(p.qty), net: r2(p.net), avg_unit: p.qty ? r2(p.net / p.qty) : null, last_unit: pc?.last ? r2(pc.last.unit) : null, last_date: pc?.last?.date || null, supplier: pc?.last?.supplier || "" }; }).sort((a, b) => b.net - a.net),
    purchasesBySupplier: [...suppliers.values()].map(s => ({ ...s, net: r2(s.net), total: r2(s.total), unpaid: r2(ap.parties.find(p => p.name === s.name)?.unpaid || 0) })).sort((a, b) => b.net - a.net),
    ar, ap,
    expensesByAccount: [...accAgg.values()].map(a => ({ ...a, amount: r2(a.amount) })).sort((a, b) => b.amount - a.amount),
    entries: entries.sort((a, b) => b.date.localeCompare(a.date)),
    sales: sales.map(d => ({ id: d.id, no: d.no, date: d.date, party: d.party, city: d.city, branch: d.branch, status: d.payment_status, net: r2(d.net * keep(d)), tax: d.tax, total: d.total, paid: d.paid, unpaid: d.unpaid, refund: d.refund })).sort((a, b) => b.date.localeCompare(a.date)),
    purchases: purchases.map(d => ({ id: d.id, no: d.no, date: d.date, party: d.party, status: d.payment_status, net: r2(d.net * keep(d)), tax: d.tax, total: d.total, paid: d.paid, unpaid: d.unpaid })).sort((a, b) => b.date.localeCompare(a.date)),
    pricing, price_guard, stock_alerts, fixed: inp.fixed, fixed_monthly: r2(fixedMonthly), settings: inp.settings, baseline: B && { ...B, months: base, provisional }, books_start: booksStart, plan, advice,
  };
}

function shiftMonth(m: string, n: number) { let [y, mo] = m.split("-").map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, "0")}`; }

/** Monthly averages over a window (used for the advisor baseline). */
function computeCore(inp: Input, from: string, to: string, monthsOverride?: number) {
  const inR = (d: string) => d >= from && d <= to; const n = monthsOverride || monthsBetween(from, to).length || 1;
  const cb = costBasis(inp.purchases, inp.products, to); const accById = new Map(inp.accounts.map(a => [a.id, a]));
  let sales = 0, salesGross = 0, cogs = 0, opex = 0, other = 0;
  for (const d of inp.sales) if (inR(d.date)) { const f = keep(d); sales += d.net * f; salesGross += d.total * f; for (const l of d.lines) { const u = cb.cost(l); if (u !== null) cogs += l.quantity * f * u; } }
  for (const e of inp.entries) if (inR(e.date)) {
    const acc = e.account_id ? accById.get(e.account_id) : undefined;
    if (e.kind === "income") { if (acc?.code.startsWith("42")) other += e.amount; continue; }
    const t = treatment(acc, inp.overrides); if (t === "opex") opex += e.amount; if (t === "cogs") cogs += e.amount;
  }
  return { months_count: n, sales: r2(sales / n), sales_gross: r2(salesGross / n), cogs: r2(cogs / n), gross: r2((sales - cogs) / n), opex: r2(opex / n), other: r2(other / n), net: r2((sales - cogs - opex + other) / n),
    gm: sales ? (sales - cogs) / sales : 0 };
}

/** Break-even and target sales; allowed spending. Pure, also reproduced on the client for the interactive slider. */
export function planning(B: ReturnType<typeof computeCore> | null, fixedPlanned: number, s: Settings) {
  const gm = B?.gm || 0, nm = s.target_net_margin / 100;
  // نعتمد القائمة اللي حددها المستخدم فقط لو مكتملة تقريباً (≥ نص المصروف الفعلي)، غير كده نخطط على الفعلي عشان الهدف ما يطلعش أقل من الحقيقة
  const actual = B?.opex || 0, usePlanned = fixedPlanned > 0 && fixedPlanned >= actual * 0.5;
  const monthlyFixed = usePlanned ? fixedPlanned : actual;
  const breakEven = gm > 0 ? monthlyFixed / gm : null;
  const target = gm > nm ? monthlyFixed / (gm - nm) : null;
  const allowedOpex = B ? Math.max(0, B.sales * (gm - nm)) : null;
  return { gm: r2(gm * 100), monthly_fixed: r2(monthlyFixed), fixed_source: usePlanned ? "planned" : "actual", fixed_planned: r2(fixedPlanned), break_even_sales: breakEven === null ? null : r2(breakEven),
    target_sales: target === null ? null : r2(target), target_annual: target === null ? null : r2(target * 12), allowed_opex: allowedOpex === null ? null : r2(allowedOpex),
    current_sales: B?.sales ?? null, current_opex: B?.opex ?? null, gap: target !== null && B ? r2(target - B.sales) : null };
}

type Advice = { level: "danger" | "warn" | "good" | "info"; title: string; text: string; tab?: string };
const STOCK_RANK: Record<string, number> = { negative: 0, out: 1, low: 2, watch: 3, ok: 4, idle: 5 };
/** Months of stock left at the last-90-days selling pace; reorder up to 2 months of cover. */
export function stockCover(stock: number, sold90: number, active = true) {
  const monthly = sold90 / 3;
  const months_cover = monthly > 0 ? Math.max(0, Math.round(stock / monthly * 10) / 10) : null;
  const stock_status = stock < 0 ? "negative" : !active || monthly <= 0 ? "idle" : stock === 0 ? "out" : months_cover! < 1 ? "low" : months_cover! < 2 ? "watch" : "ok";
  return { sold_90: Math.round(sold90 * 100) / 100, monthly_pace: Math.round(monthly * 10) / 10, months_cover, stock_status, reorder_qty: monthly > 0 ? Math.max(0, Math.ceil(monthly * 2 - Math.max(0, stock))) : 0 };
}
const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
function adviseAll(a: { monthly: Array<{ m: string; sales: number; opex: number }>; price_guard: { lines: Array<{ item: string; below_cost: boolean }>; below_cost: number; below_breakeven: number; lost: number; real_loss: number }; stock_alerts: Array<{ name: string; stock_status: string; months_cover: number | null; reorder_qty: number }>; B: ReturnType<typeof computeCore> | null; plan: ReturnType<typeof planning>; ar: { total: number; overdue: number; buckets: Record<string, number>; parties: Array<{ name: string; unpaid: number; oldestDue: number }> }; ap: { total: number; overdue: number }; pricing: Array<{ name: string; status: string; realized_price: number | null; avg_cost: number | null; suggested_price: number | null; qty_sold: number; stock_value: number | null; breakeven_price: number | null }>; clients: Array<{ name: string; net: number }>; salesNet: number; inp: Input; opexRatio: number; coverage: number; entries: Array<{ treatment: string; account: string; amount: number }> }): Advice[] {
  const out: Advice[] = []; const { B, plan } = a;
  const gaps = a.monthly.filter(m => m.m < a.inp.today.slice(0, 7) && m.sales > 0 && m.opex <= 0).map(m => m.m); // closed months only
  if (gaps.length) out.push({ level: "warn", title: `${gaps.length} شهر فيهم مبيعات ومفيش مصروفات متسجلة`, text: `${gaps.join("، ")} — غالباً الرواتب والإيجار ما اتسجلوش في دفترة الشهور دي، فالربح فيها ظاهر أعلى من الحقيقة. سجّل المصروفات كل شهر في نفس الشهر.`, tab: "audit" });
  if (plan.fixed_planned > 0 && plan.fixed_source === "actual") out.push({ level: "info", title: `المصاريف الثابتة اللي سجلتها (${fmt(plan.fixed_planned)}) أقل بكتير من مصروفك الفعلي`, text: `متوسط مصروفك الشهري الفعلي في دفترة ${fmt(plan.monthly_fixed)}، فحسبت الأهداف عليه عشان ما تتفاجئش. كمّل قائمة المصاريف الثابتة (رواتب، إيجار، تسويق…) وأنا هعتمدها.`, tab: "pnl" });
  if (B && B.sales > 0) {
    const nm = B.net / B.sales * 100, tgt = a.inp.settings.target_net_margin;
    if (B.net < 0) out.push({ level: "danger", title: `الشركة بتخسر ${fmt(-B.net)} في الشهر في المتوسط`, text: `متوسط مبيعاتك ${fmt(B.sales)} شهرياً، والمصاريف التشغيلية ${fmt(B.opex)}. محتاج تبيع ${plan.break_even_sales ? fmt(plan.break_even_sales) : "—"} شهرياً عشان تغطي المصاريف (نقطة التعادل)، أو تقلل المصاريف.`, tab: "advisor" });
    else if (nm < tgt) out.push({ level: "warn", title: `صافي الربح ${nm.toFixed(1)}% — أقل من هدفك ${tgt}%`, text: `عشان توصل للهدف: يا إما تزود المبيعات لـ ${plan.target_sales ? fmt(plan.target_sales) : "—"} شهرياً، يا إما تنزل المصاريف لـ ${plan.allowed_opex !== null ? fmt(plan.allowed_opex) : "—"} شهرياً.`, tab: "advisor" });
    else out.push({ level: "good", title: `صافي الربح ${nm.toFixed(1)}% — فوق هدفك ${tgt}%`, text: `أداء ممتاز. متوسط صافي الربح ${fmt(B.net)} شهرياً. حافظ على المصاريف تحت ${plan.allowed_opex !== null ? fmt(plan.allowed_opex) : "—"}.`, tab: "advisor" });
    if (plan.allowed_opex !== null && B.opex > plan.allowed_opex) out.push({ level: "warn", title: `المصاريف أعلى من المسموح بـ ${fmt(B.opex - plan.allowed_opex)} شهرياً`, text: `على مستوى مبيعاتك الحالي، المسموح تصرفه ${fmt(plan.allowed_opex)} في الشهر عشان تحقق ${a.inp.settings.target_net_margin}% صافي ربح. راجع أكبر بنود المصاريف في تبويب الأرباح.`, tab: "pnl" });
    if (plan.gm < a.inp.settings.target_gross_margin) out.push({ level: "warn", title: `هامش مجمل الربح ${plan.gm}% أقل من المستهدف ${a.inp.settings.target_gross_margin}%`, text: "يعني الفرق بين سعر البيع وتكلفة الشراء ضيق. راجع تبويب المنتجات والتسعير — فيه السعر المقترح لكل منتج.", tab: "pricing" });
  }
  const dso = B && B.sales_gross > 0 ? a.ar.total / B.sales_gross * 30 : null;
  if (a.ar.total > 0) {
    const old = (a.ar.buckets["61-90"] || 0) + (a.ar.buckets["90+"] || 0);
    if (old > 0) out.push({ level: old > a.ar.total * 0.3 ? "danger" : "warn", title: `${fmt(old)} ليك عند العملاء متأخرة أكثر من 60 يوم`, text: `أكبرهم: ${a.ar.parties.slice(0, 3).map(p => `${p.name.slice(0, 40)} (${fmt(p.unpaid)})`).join("، ")}. كل ما الدين يقدم، احتمال تحصيله يقل — ابدأ بالأقدم.${dso ? ` متوسط مدة التحصيل عندك ${Math.round(dso)} يوم (الطبيعي 45–60).` : ""}`, tab: "ar" });
  }
  const loss = a.pricing.filter(p => p.status === "loss"), below = a.pricing.filter(p => p.status === "below_breakeven");
  if (loss.length) out.push({ level: "danger", title: `${loss.length} منتج اتباع بأقل من تكلفة شرائه`, text: loss.slice(0, 4).map(p => `${p.name}: بيع ${p.realized_price} وتكلفة ${p.avg_cost}`).join(" · "), tab: "pricing" });
  if (below.length) out.push({ level: "warn", title: `${below.length} منتج سعره ما يغطيش نصيبه من المصاريف`, text: `يعني بيكسب على الورق لكن بعد المصاريف بيخسر. أمثلة: ${below.slice(0, 4).map(p => `${p.name} (سعر التعادل ${p.breakeven_price})`).join(" · ")}`, tab: "pricing" });
  if (a.price_guard.below_cost) out.push({ level: "danger", title: `${a.price_guard.below_cost} بيعة بأقل من تكلفة الشراء — خسارة فعلية ${fmt(a.price_guard.real_loss)}`, text: "دي بيعات خسرت فيها فلوس فعلاً (سعر البيع أقل من اللي اشتريت بيه). راجعها في حماية السعر واعرف مين باع وليه.", tab: "pricing" });
  if (a.price_guard.below_breakeven) out.push({ level: "info", title: `${a.price_guard.below_breakeven} بيعة كسبانة بس بهامش أقل من هدفك ${a.inp.settings.target_gross_margin}%`, text: `مش خسارة — لكن لو اتباعت بالسعر المستهدف كان الربح هيزيد حوالي ${fmt(a.price_guard.lost)}. حدد للمناديب أقصى خصم مسموح من تبويب التسعير.`, tab: "pricing" });
  const st = a.stock_alerts; if (st.length) { const neg = st.filter(s => s.stock_status === "negative"); out.push({ level: "warn", title: `${st.length} صنف مخزونه قرب يخلص أو خلص`, text: `${st.slice(0, 4).map(s => `${s.name} (${s.stock_status === "negative" ? "رصيد بالسالب" : s.stock_status === "out" ? "خلص" : `يكفي ${s.months_cover} شهر`})`).join(" · ")}${neg.length ? ` — الرصيد بالسالب معناه فواتير بيع اتعملت من غير ما المخزون يتسجل في دفترة، راجع الجرد.` : ""}`, tab: "pricing" }); }
  const dead = a.pricing.filter(p => p.status === "dead_stock" && (p.stock_value || 0) > 0); const deadV = dead.reduce((s, p) => s + (p.stock_value || 0), 0);
  if (deadV > 0) out.push({ level: "info", title: `بضاعة راكدة بقيمة ${fmt(deadV)}`, text: `${dead.length} منتج عليه رصيد وما اتباعش من أكتر من 90 يوم (${dead.slice(0, 3).map(p => p.name).join("، ")}). فكّر في عرض أو باقة لتحريكه.`, tab: "pricing" });
  const top = [...a.clients].sort((x, y) => y.net - x.net)[0];
  if (top && a.salesNet > 0 && top.net / a.salesNet > 0.3) out.push({ level: "info", title: `${Math.round(top.net / a.salesNet * 100)}% من مبيعاتك من عميل واحد`, text: `${top.name} — الاعتماد الكبير على عميل واحد مخاطرة. وزّع جهد المناديب على عملاء جدد.`, tab: "sales" });
  if (a.ap.overdue > 0) out.push({ level: "info", title: `عليك ${fmt(a.ap.overdue)} للموردين فات ميعادها`, text: "رتّب الدفع حسب الأقدم عشان تحافظ على علاقتك وأسعارك مع الموردين.", tab: "ap" });
  if (a.coverage < 0.95) out.push({ level: "info", title: `${Math.round((1 - a.coverage) * 100)}% من المبيعات منتجاتها بدون تكلفة شراء`, text: "عشان الربح يطلع دقيق، سجّل فواتير الشراء لهذه المنتجات في دفترة أو حط سعر الشراء في بطاقة المنتج.", tab: "pricing" });
  const unmapped = a.entries.filter(e => e.treatment !== "exclude" && e.account === "بدون حساب").reduce((s, e) => s + e.amount, 0);
  if (unmapped >= 100) out.push({ level: "info", title: `مصروفات ${fmt(unmapped)} بدون حساب في دفترة`, text: "اعتبرتها مصروف تشغيلي. لو مش كده غيّرها من تبويب الأرباح.", tab: "pnl" });
  return out;
}

/* ───────────────────────── Loader ───────────────────────── */
export async function loadInput(today: string): Promise<Input> {
  const docs = async (table: string, items: string, fk: string, party: string, city: string, branch: string) => {
    const head = await query(`SELECT id, no, invoice_date::text date, due_days, ${party}_id party_id, ${party}_name party, ${city} city, ${branch} branch, payment_status, net::float8, tax::float8, total::float8, paid::float8, unpaid::float8, refund::float8 FROM ${table}`);
    const lines = await query(`SELECT ${fk} doc, product_id, item, quantity::float8, net::float8, tax::float8 FROM ${items} ORDER BY ${fk}, line`);
    const by = new Map<number, Line[]>(); for (const l of lines.rows as Array<Line & { doc: string }>) { const k = Number(l.doc); (by.get(k) || by.set(k, []).get(k)!).push({ product_id: l.product_id === null ? null : Number(l.product_id), item: l.item, quantity: l.quantity, net: l.net, tax: l.tax }); }
    return (head.rows as Array<Omit<Doc, "lines">>).map(d => ({ ...d, id: Number(d.id), party_id: d.party_id === null ? null : Number(d.party_id), lines: by.get(Number(d.id)) || [] }));
  };
  const [sales, purchases, products, payments, entries, accounts, overrides, fixed, settings] = await Promise.all([
    docs("daftra_invoices", "daftra_invoice_items", "invoice_id", "client", "client_city", "branch"),
    docs("daftra_purchases", "daftra_purchase_items", "purchase_id", "supplier", "''", "''"),
    query("SELECT id, name, code, list_price::float8, buy_price::float8, average_cost::float8, min_price::float8, stock::float8, active FROM daftra_products"),
    query("SELECT pay_date::text date, amount::float8, client_id FROM daftra_client_payments"),
    query("SELECT id, kind, entry_date::text date, amount::float8, tax::float8, account_id, vendor, note FROM daftra_cash_entries"),
    query("SELECT id, code, name FROM daftra_accounts"),
    query("SELECT account_id, treatment FROM fin_account_overrides"),
    query("SELECT id, name, category, monthly_amount::float8, start_month::text, end_month::text, notes FROM fin_fixed_expenses ORDER BY monthly_amount DESC"),
    query("SELECT target_gross_margin::float8, target_net_margin::float8, books_start::text FROM fin_settings WHERE id=1"),
  ]);
  return { sales, purchases,
    products: (products.rows as Product[]).map(p => ({ ...p, id: Number(p.id) })),
    payments: payments.rows as Payment[],
    entries: (entries.rows as Entry[]).map(e => ({ ...e, id: Number(e.id), account_id: e.account_id === null ? null : Number(e.account_id) })),
    accounts: (accounts.rows as Account[]).map(a => ({ ...a, id: Number(a.id) })),
    overrides: Object.fromEntries((overrides.rows as Array<{ account_id: string; treatment: Treatment }>).map(o => [Number(o.account_id), o.treatment])),
    fixed: fixed.rows as Fixed[], settings: (settings.rows[0] as Settings) || { target_gross_margin: 45, target_net_margin: 15 }, today };
}
