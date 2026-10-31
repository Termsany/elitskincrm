/** Collections: Daftra open invoices routed to the CRM rep responsible for the customer (read-only toward Daftra). */
import { query } from "@/lib/db";

export const RESULTS: Record<string, string> = { contacted: "اتواصلت", promised: "وعد بالدفع", partial: "دفع جزء", paid: "دفع", disputed: "معترض", no_answer: "ما ردش" };

const STOP = new Set(["شركة", "مؤسسة", "مجمع", "مجموعة", "عيادات", "عيادة", "مركز", "مستشفى", "طبي", "الطبي", "الطبية", "طبية", "لطب", "وتقويم", "و", "ال", "co", "company", "clinic", "clinics", "center", "centre", "medical", "complex", "group", "hospital", "polyclinic", "est", "ltd", "the", "for", "and", "of",
  // cities — shared by many customers, never identify one
  "riyadh", "الرياض", "رياض", "jeddah", "جده", "جدة", "dammam", "الدمام", "دمام", "khobar", "الخبر", "خبر", "dahran", "dhahran", "الظهران", "ظهران", "qatif", "القطيف", "قطيف", "ahsa", "hasa", "الاحساء", "احساء", "jubail", "الجبيل", "جبيل", "makkah", "مكه", "مكة", "madinah", "المدينه", "المدينة", "taif", "الطائف", "tabuk", "تبوك", "abha", "ابها", "qassim", "القصيم", "buraidah", "بريده", "hofuf", "الهفوف", "ksa", "saudi", "السعوديه", "السعودية"]);
const STOPN = new Set([...STOP].map(w => w.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")));
/** Normalised tokens for fuzzy matching Arabic/English business names. */
export function tokens(s: string) {
  return String(s || "").toLowerCase()
    .replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").map(w => w.replace(/^ال(?=\p{L}{3,})/u, "")).filter(w => w.length > 1 && !STOPN.has(w));
}
export function similarity(a: string, b: string) {
  const A = new Set(tokens(a)), Bt = new Set(tokens(b)); if (!A.size || !Bt.size) return 0;
  let hit = 0; for (const w of A) if (Bt.has(w) || [...Bt].some(x => (x.length > 3 && w.length > 3) && (x.startsWith(w) || w.startsWith(x)))) hit++;
  return hit / Math.min(A.size, Bt.size) * (Math.min(A.size, Bt.size) / Math.max(A.size, Bt.size)) ** 0.25;
}

/** Customers with open balances + their link + an automatic suggestion (best clinic by name, rep with most visits there in 180 days). */
export async function clientLinks(today: string) {
  const [cl, links, clinics, reps, fu] = await Promise.all([
    query<{ client_id: string; name: string; unpaid: number; overdue: number; n: number; oldest: number | null }>(`SELECT client_id, max(client_name) name, sum(unpaid)::float8 unpaid,
      sum(unpaid) FILTER (WHERE invoice_date + COALESCE(due_days,0) < $1::date)::float8 overdue, count(*)::int n,
      max($1::date - (invoice_date + COALESCE(due_days,0))) FILTER (WHERE unpaid > 0) oldest
      FROM daftra_invoices WHERE client_id IS NOT NULL AND payment_status <> 3 GROUP BY client_id ORDER BY sum(unpaid) DESC`, [today]),
    query<{ client_id: string; rep_id: string | null; clinic_id: string | null }>("SELECT client_id, rep_id, clinic_id FROM daftra_client_links"),
    query<{ id: string; name: string; city: string; rep_id: string | null; rep_name: string | null }>(`SELECT c.id, c.name, c.city, top.rep_id, top.rep_name FROM clinics c
      LEFT JOIN LATERAL (SELECT v.sales_rep_id rep_id, u.name rep_name, count(*) n FROM visits v JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id
        WHERE (d.clinic_id=c.id OR lower(btrim(d.clinic_name))=lower(btrim(c.name))) AND v.visited_at > now() - interval '180 days' AND u.role='sales_rep' AND u.active
        GROUP BY 1,2 ORDER BY n DESC LIMIT 1) top ON true WHERE c.active ORDER BY c.name`),
    query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name"),
    query<{ client_id: string; result: string; promise_date: string | null; note: string; created_at: string; rep_name: string }>(`SELECT DISTINCT ON (f.client_id) f.client_id, f.result, f.promise_date::text, f.note, f.created_at, u.name rep_name
      FROM collection_followups f JOIN users u ON u.id=f.rep_id ORDER BY f.client_id, f.created_at DESC`),
  ]);
  const L = new Map(links.rows.map(l => [String(l.client_id), l])), F = new Map(fu.rows.map(f => [String(f.client_id), f]));
  return {
    reps: reps.rows, clinics: clinics.rows.map(c => ({ id: c.id, name: c.name, city: c.city })),
    clients: cl.rows.map(c => {
      let best: { clinic_id: string; clinic_name: string; rep_id: string | null; rep_name: string | null; score: number } | null = null;
      for (const k of clinics.rows) { const sc = similarity(c.name, k.name); if (sc >= 0.5 && (!best || sc > best.score)) best = { clinic_id: k.id, clinic_name: k.name, rep_id: k.rep_id, rep_name: k.rep_name, score: Math.round(sc * 100) / 100 }; }
      const l = L.get(String(c.client_id));
      return { client_id: Number(c.client_id), name: c.name, unpaid: Math.round(c.unpaid * 100) / 100, overdue: Math.round((c.overdue || 0) * 100) / 100, invoices: c.n, oldest: c.oldest,
        rep_id: l?.rep_id ?? null, clinic_id: l?.clinic_id ?? null, linked: !!l, suggestion: best, last_followup: F.get(String(c.client_id)) ?? null };
    }),
  };
}

/** Open invoices of the customers linked to one rep (or all linked customers for the admin). */
export async function collectionsFor(repId: string | null, today: string) {
  const vals: unknown[] = [today]; let where = "l.rep_id IS NOT NULL"; if (repId) { vals.push(repId); where = `l.rep_id=$2`; }
  const inv = await query<{ client_id: string; name: string; rep_id: string; rep_name: string; clinic_name: string | null; id: string; no: string; date: string; due: string; unpaid: number; days: number }>(`
    SELECT i.client_id, i.client_name name, l.rep_id, u.name rep_name, c.name clinic_name, i.id, i.no, i.invoice_date::text date, (i.invoice_date + COALESCE(i.due_days,0))::text due,
      i.unpaid::float8 unpaid, ($1::date - (i.invoice_date + COALESCE(i.due_days,0)))::int days
    FROM daftra_invoices i JOIN daftra_client_links l ON l.client_id=i.client_id JOIN users u ON u.id=l.rep_id LEFT JOIN clinics c ON c.id=l.clinic_id
    WHERE ${where} AND i.unpaid > 0 AND i.payment_status <> 3 ORDER BY days DESC`, vals);
  const ids = [...new Set(inv.rows.map(r => String(r.client_id)))];
  const fu = ids.length ? await query<{ client_id: string; id: string; result: string; promise_date: string | null; amount: number | null; note: string; created_at: string; rep_name: string }>(`
    SELECT f.client_id, f.id, f.result, f.promise_date::text, f.amount::float8, f.note, f.created_at, u.name rep_name FROM collection_followups f JOIN users u ON u.id=f.rep_id
    WHERE f.client_id = ANY($1::bigint[]) ORDER BY f.created_at DESC`, [ids]) : { rows: [] };
  const by = new Map<string, { client_id: number; name: string; rep_id: string; rep_name: string; clinic_name: string | null; unpaid: number; overdue: number; oldest: number; invoices: Array<{ id: number; no: string; date: string; due: string; unpaid: number; days: number }>; followups: typeof fu.rows }>();
  for (const r of inv.rows) {
    const k = String(r.client_id);
    const g = by.get(k) || { client_id: Number(r.client_id), name: r.name, rep_id: r.rep_id, rep_name: r.rep_name, clinic_name: r.clinic_name, unpaid: 0, overdue: 0, oldest: -9999, invoices: [], followups: fu.rows.filter(f => String(f.client_id) === k).slice(0, 5) };
    g.unpaid += r.unpaid; if (r.days > 0) g.overdue += r.unpaid; g.oldest = Math.max(g.oldest, r.days);
    g.invoices.push({ id: Number(r.id), no: r.no, date: r.date, due: r.due, unpaid: r.unpaid, days: r.days }); by.set(k, g);
  }
  const clients = [...by.values()].map(g => ({ ...g, unpaid: Math.round(g.unpaid * 100) / 100, overdue: Math.round(g.overdue * 100) / 100 })).sort((a, b) => b.oldest - a.oldest || b.overdue - a.overdue);
  return { clients, total: Math.round(clients.reduce((s, c) => s + c.unpaid, 0) * 100) / 100, overdue: Math.round(clients.reduce((s, c) => s + c.overdue, 0) * 100) / 100,
    over60: Math.round(clients.reduce((s, c) => s + c.invoices.filter(i => i.days > 60).reduce((t, i) => t + i.unpaid, 0), 0) * 100) / 100 };
}
