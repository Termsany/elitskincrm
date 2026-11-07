import { query } from "@/lib/db";
import { OBJECTIONS, POSITIVES } from "@/lib/visit-insights";
import { clientOfClinicSql } from "@/lib/clinic-groups";

/**
 * Visits ↔ Daftra sales for a period: per clinic (effort vs money), per product (presentations that turned into
 * orders at the same clinic within 30 days) and samples (given → bought within 60 days).
 */
export async function visitSales(from: string, to: string, repId?: string | null) {
  const rep = repId ? "AND v.sales_rep_id = $3" : "";
  const vals: unknown[] = repId ? [from, to, repId] : [from, to];
  const [clinics, products, samples] = await Promise.all([
    // one row per account: a Daftra customer with all its branches, or a clinic that has no customer
    query<{ clinic_id: string; clinic: string; city: string | null; branches: string | null; visits: number; doctors: number; last_visit: string | null; sales: number; invoices: number; last_invoice: string | null; linked: boolean }>(`
      WITH m AS (SELECT c.id, c.name, c.city, ${clientOfClinicSql("c.id")} client_id FROM clinics c),
        v AS (SELECT COALESCE('k' || m.client_id, 'c' || m.id) key, count(*)::int visits, count(DISTINCT v.doctor_id)::int doctors, max(v.visited_at)::date::text last_visit,
            string_agg(DISTINCT m.name, '، ') branches, min(m.city) city, min(m.name) one
          FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN m ON m.id=d.clinic_id WHERE v.status::text='completed'
            AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1 AND $2 ${rep} GROUP BY 1),
        s AS (SELECT 'k' || client_id key, sum(value)::float8 sales, count(DISTINCT invoice_id)::int invoices, max(invoice_date)::text last_invoice FROM daftra_sales_v
          WHERE client_id IS NOT NULL AND invoice_date BETWEEN $1 AND $2 ${repId ? "AND rep_id = $3" : ""} GROUP BY 1)
      SELECT COALESCE(v.key, s.key) clinic_id,
        CASE WHEN COALESCE(v.key, s.key) LIKE 'k%' THEN COALESCE((SELECT max(client_name) FROM daftra_invoices i WHERE i.client_id = substr(COALESCE(v.key, s.key), 2)::bigint), v.one) ELSE v.one END clinic,
        v.city, CASE WHEN COALESCE(v.key, s.key) LIKE 'k%' THEN v.branches END branches,
        COALESCE(v.visits,0) visits, COALESCE(v.doctors,0) doctors, v.last_visit, COALESCE(s.sales,0) sales, COALESCE(s.invoices,0) invoices, s.last_invoice,
        COALESCE(v.key, s.key) LIKE 'k%' linked
      FROM v FULL JOIN s ON s.key=v.key ORDER BY COALESCE(s.sales,0) DESC, COALESCE(v.visits,0) DESC`, vals),
    query<{ product_id: string; product: string; presented: number; clinics: number; converted: number; sales_after: number }>(`
      WITH p AS (SELECT pp.product_id, ${clientOfClinicSql("d.clinic_id")} AS client_id, d.clinic_id, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date AS day FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id JOIN doctors d ON d.id=v.doctor_id
          WHERE (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1 AND $2 AND d.clinic_id IS NOT NULL ${rep}),
        conv AS (SELECT p.product_id, p.clinic_id, p.day, (SELECT COALESCE(sum(s.value),0) FROM daftra_sales_v s WHERE s.client_id=p.client_id AND s.product_id=p.product_id
            AND s.invoice_date > p.day AND s.invoice_date <= p.day + 30) after FROM p)
      SELECT c.product_id, pr.name product, count(*)::int presented, count(DISTINCT c.clinic_id)::int clinics, count(*) FILTER (WHERE c.after > 0)::int converted,
        (SELECT COALESCE(sum(m),0) FROM (SELECT max(c2.after) m FROM conv c2 WHERE c2.product_id=c.product_id GROUP BY c2.clinic_id) z)::float8 sales_after
      FROM conv c JOIN products pr ON pr.id=c.product_id GROUP BY 1,2 ORDER BY presented DESC`, vals),
    query<{ product_id: string; product: string; given: number; units: number; clinics: number; bought: number }>(`
      WITH g AS (SELECT vi.product_id, ${clientOfClinicSql("d.clinic_id")} AS client_id, d.clinic_id, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date AS day, vi.quantity FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN doctors d ON d.id=v.doctor_id
          WHERE vi.kind::text='sample' AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1 AND $2 AND d.clinic_id IS NOT NULL ${rep})
      SELECT g.product_id, pr.name product, count(*)::int given, COALESCE(sum(g.quantity),0)::int units, count(DISTINCT g.clinic_id)::int clinics,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daftra_sales_v s WHERE s.client_id=g.client_id AND s.product_id=g.product_id AND s.invoice_date > g.day AND s.invoice_date <= g.day + 60))::int bought
      FROM g JOIN products pr ON pr.id=g.product_id GROUP BY 1,2 ORDER BY given DESC`, vals),
  ]);
  const rows = clinics.rows.map(c => ({ ...c, flag: c.visits >= 3 && !c.sales ? "effort" : c.sales > 0 && !c.visits ? "neglected" : c.sales > 0 && c.visits ? "ok" : !c.linked && c.visits ? "unlinked" : "none" }));
  return {
    clinics: rows,
    summary: { effort: rows.filter(r => r.flag === "effort").length, neglected: rows.filter(r => r.flag === "neglected").length, neglectedSales: Math.round(rows.filter(r => r.flag === "neglected").reduce((s, r) => s + r.sales, 0)), unlinked: rows.filter(r => r.flag === "unlinked").length },
    products: products.rows.map(p => ({ ...p, rate: p.presented ? Math.round(p.converted / p.presented * 100) : null })),
    samples: samples.rows.map(s => ({ ...s, rate: s.given ? Math.round(s.bought / s.given * 100) : null })),
  };
}

/** What doctors say per product in a period: reactions, objections and positive signals from the notes, with example notes. */
export async function productVoice(from: string, to: string) {
  const rows = (await query<{ product_id: string; product: string; reaction: string | null; insights: { objections?: string[]; positives?: string[]; sentiment?: string } | null; notes: string; day: string }>(`
    SELECT pp.product_id, pr.name product, pp.reaction::text reaction, v.insights, v.notes, (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day
    FROM visit_presented_products pp JOIN visits v ON v.id=pp.visit_id JOIN products pr ON pr.id=pp.product_id
    WHERE (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1 AND $2`, [from, to])).rows;
  const by = new Map<string, { product_id: string; product: string; n: number; reactions: Record<string, number>; objections: Record<string, number>; positives: Record<string, number>; quotes: string[] }>();
  for (const r of rows) {
    const g = by.get(r.product_id) || { product_id: r.product_id, product: r.product, n: 0, reactions: {}, objections: {}, positives: {}, quotes: [] };
    g.n++; if (r.reaction) g.reactions[r.reaction] = (g.reactions[r.reaction] || 0) + 1;
    for (const o of r.insights?.objections || []) g.objections[o] = (g.objections[o] || 0) + 1;
    for (const p of r.insights?.positives || []) g.positives[p] = (g.positives[p] || 0) + 1;
    if ((r.insights?.objections || []).length && r.notes && g.quotes.length < 3) g.quotes.push(r.notes.slice(0, 160));
    by.set(r.product_id, g);
  }
  return [...by.values()].sort((a, b) => b.n - a.n).map(g => {
    const top = Object.entries(g.objections).filter(([k]) => k !== "busy").sort((a, b) => b[1] - a[1])[0], interested = g.reactions.interested || 0;
    const summary = [`${g.n} شرح`, g.n ? `${Math.round(interested / g.n * 100)}% مهتمين` : null, top ? `أكتر اعتراض: ${OBJECTIONS[top[0]] || top[0]} (${Math.round(top[1] / g.n * 100)}%)` : "مفيش اعتراضات متكررة"].filter(Boolean).join(" · ");
    return { ...g, summary, objections: Object.entries(g.objections).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: OBJECTIONS[k] || k, n })),
      positives: Object.entries(g.positives).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: POSITIVES[k] || k, n })) };
  });
}

/** Optional Claude summary for one product's notes (needs ANTHROPIC_API_KEY); null when unavailable. */
export async function aiProductSummary(product: string, notes: string[]) {
  const key = process.env.ANTHROPIC_API_KEY?.trim(); if (!key || !notes.length) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(25000),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: 400, messages: [{ role: "user", content:
        `These are medical sales visit notes about the product ${product}. Summarise for the sales manager in 3 short bullet points in Egyptian Arabic: what doctors like, the main objections, and one recommended action. Notes:\n${notes.slice(0, 60).map(n => `- ${n.slice(0, 200)}`).join("\n")}` }] }) });
    if (!r.ok) return null;
    const j = await r.json() as { content?: Array<{ text?: string }> };
    return (j.content?.[0]?.text || "").trim() || null;
  } catch { return null; }
}
