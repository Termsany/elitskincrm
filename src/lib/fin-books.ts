/** Pure helpers for the accounts page: party statements and the attention list. No I/O. */

export type StDoc = { id: number; no: string; date: string; due_days: number; status: number; total: number; paid: number; unpaid: number; refund: number };
export type StPay = { id: number; date: string; amount: number; invoice_id: number | null; method: string };
export type StLine = { date: string; kind: "invoice" | "refund" | "payment"; ref: string; doc_id: number | null; debit: number; credit: number; balance: number; note: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/**
 * Running statement. Customer: invoice = debit (they owe you), payment / refund = credit.
 * Supplier: purchase = credit (you owe them); Daftra supplier payments aren't mirrored, so the paid part of each
 * purchase is shown as one debit line on the purchase date. The closing balance always equals the open amounts.
 */
export function statement(kind: "client" | "supplier", docs: StDoc[], pays: StPay[], today: string) {
  const lines: Omit<StLine, "balance">[] = [];
  const draft = (d: StDoc) => d.status === 3;
  for (const d of docs) {
    if (draft(d)) continue;
    if (kind === "client") {
      lines.push({ date: d.date, kind: "invoice", ref: d.no, doc_id: d.id, debit: d.total, credit: 0, note: `فاتورة ${d.no}` });
      if (d.refund > 0) lines.push({ date: d.date, kind: "refund", ref: d.no, doc_id: d.id, debit: 0, credit: d.refund, note: `مرتجع على ${d.no}` });
    } else {
      lines.push({ date: d.date, kind: "invoice", ref: d.no, doc_id: d.id, debit: 0, credit: d.total, note: `فاتورة شراء ${d.no}` });
      if (d.refund > 0) lines.push({ date: d.date, kind: "refund", ref: d.no, doc_id: d.id, debit: d.refund, credit: 0, note: `مرتجع على ${d.no}` });
      const paid = r2(d.total - d.refund - d.unpaid);
      if (paid > 0) lines.push({ date: d.date, kind: "payment", ref: d.no, doc_id: d.id, debit: paid, credit: 0, note: `المدفوع من ${d.no}` });
    }
  }
  if (kind === "client") for (const p of pays) lines.push({ date: p.date, kind: "payment", ref: String(p.id), doc_id: p.invoice_id, debit: 0, credit: p.amount, note: p.method ? `دفعة (${p.method})` : "دفعة" });
  const order = { invoice: 0, refund: 1, payment: 2 } as const;
  lines.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  let bal = 0;
  const sign = kind === "client" ? 1 : -1; // positive = they owe you (client) / you owe them (supplier)
  const out: StLine[] = lines.map(l => { bal += sign * (l.debit - l.credit); return { ...l, debit: r2(l.debit), credit: r2(l.credit), balance: r2(bal) }; });
  const open = docs.filter(d => !draft(d) && d.unpaid > 0 && (d.status === 0 || d.status === 1)).map(d => {
    const due = addDays(d.date, d.due_days || 0); return { id: d.id, no: d.no, date: d.date, due, unpaid: r2(d.unpaid), days_late: Math.max(0, days(due, today)) };
  }).sort((a, b) => b.days_late - a.days_late);
  const openTotal = r2(open.reduce((s, o) => s + o.unpaid, 0));
  return {
    lines: out,
    totals: { invoiced: r2(docs.filter(d => !draft(d)).reduce((s, d) => s + d.total, 0)), refunds: r2(docs.reduce((s, d) => s + d.refund, 0)),
      paid: r2(kind === "client" ? pays.reduce((s, p) => s + p.amount, 0) : docs.filter(d => !draft(d)).reduce((s, d) => s + Math.max(0, d.total - d.refund - d.unpaid), 0)),
      balance: r2(bal), open: openTotal, overdue: r2(open.filter(o => o.days_late > 0).reduce((s, o) => s + o.unpaid, 0)),
      // payments Daftra didn't tie to an invoice (or an advance) make the running balance differ from the open invoices
      unallocated: r2(bal - openTotal) },
    open,
    last_invoice: docs.length ? docs[docs.length - 1].date : null,
    last_payment: pays.length ? pays[pays.length - 1].date : null,
  };
}

export type Attention = { level: "danger" | "warn" | "info"; title: string; text: string; tab: string; party?: string; kind?: "client" | "supplier" };
type Book = { parties: Array<{ name: string; unpaid: number; overdue: number; oldestDue: number }>; open: Array<{ party: string; unpaid: number; due: string; days: number }> };
type Mon = { m: string; opex: number; sales: number; cogs: number };

/** What the owner should look at today, most urgent first (at most `max`). */
export function attention(x: { ar: Book; ap: Book; monthly: Mon[]; price_guard: { below_cost: number; real_loss: number }; stock_alerts: Array<{ name: string; stock_status: string }>; cost_coverage: number; today: string }, max = 8): Attention[] {
  const out: Attention[] = [];
  const k = (n: number) => Math.round(n).toLocaleString("en-US");
  for (const p of x.ar.parties.filter(p => p.oldestDue > 60 && p.overdue > 0).slice(0, 3))
    out.push({ level: p.oldestDue > 90 ? "danger" : "warn", title: `${p.name}: ${k(p.overdue)} ر.س متأخر`, text: `أقدم فاتورة متأخرة ${p.oldestDue} يوم.`, tab: "clients", party: p.name, kind: "client" });
  const week = addDays(x.today, 7);
  const dueAp = x.ap.open.filter(o => o.due <= week);
  if (dueAp.length) {
    const by = new Map<string, number>(); for (const o of dueAp) by.set(o.party, (by.get(o.party) || 0) + o.unpaid);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
    out.push({ level: dueAp.some(o => o.days > 0) ? "danger" : "warn", title: `${k(dueAp.reduce((s, o) => s + o.unpaid, 0))} ر.س للموردين مستحقة لحد ${week}`, text: top.slice(0, 3).map(([n, v]) => `${n} ${k(v)}`).join("، "), tab: "suppliers", party: top[0][0], kind: "supplier" });
  }
  if (x.price_guard.below_cost > 0) out.push({ level: "danger", title: `${x.price_guard.below_cost} سطر اتباع تحت التكلفة`, text: `خسارة فعلية ${k(x.price_guard.real_loss)} ر.س في الفترة.`, tab: "products" });
  const done = x.monthly.filter(m => m.m < x.today.slice(0, 7));
  if (done.length >= 2) {
    const last = done[done.length - 1], prev = done.slice(0, -1), avg = prev.reduce((s, m) => s + m.opex, 0) / prev.length;
    if (avg > 0 && last.opex > avg * 1.3 && last.opex - avg > 1000) out.push({ level: "warn", title: `مصروفات ${last.m} أعلى من المتوسط بـ ${Math.round((last.opex / avg - 1) * 100)}%`, text: `${k(last.opex)} مقابل متوسط ${k(avg)} ر.س.`, tab: "expenses" });
  }
  const out0 = x.stock_alerts.filter(s => s.stock_status === "out" || s.stock_status === "negative");
  if (out0.length) out.push({ level: "warn", title: `${out0.length} صنف خلص من المخزون`, text: out0.slice(0, 4).map(s => s.name).join("، "), tab: "products" });
  if (x.cost_coverage < 90) out.push({ level: "info", title: `تكلفة ${Math.round(x.cost_coverage)}% بس من المبيعات معروفة`, text: "الربح ممكن يكون أعلى من الحقيقي: أصناف اتباعت من غير فاتورة شراء ليها في دفترة.", tab: "products" });
  const rank = { danger: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, max);
}
