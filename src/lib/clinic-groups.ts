import { query } from "@/lib/db";
import { tokens } from "@/lib/collections";

/**
 * One Daftra customer can be several CRM clinics (branches in different places with different doctors),
 * e.g. "شركة الحسن والجمال" = HOSN yarmouk, HOSN Dahran, HOSN Dammam… Sales and balance are per customer;
 * visits and doctors are per branch. daftra_client_branches maps branch → customer (a branch has one customer).
 */

/** SQL: the Daftra customer of clinic expression `c` (branch mapping, then the customer link, then the clinic created from Daftra). */
export const clientOfClinicSql = (c: string) => `COALESCE((SELECT b.client_id FROM daftra_client_branches b WHERE b.clinic_id=${c}),
  (SELECT l.client_id FROM daftra_client_links l WHERE l.clinic_id=${c} LIMIT 1), (SELECT cc.daftra_client_id FROM clinics cc WHERE cc.id=${c}))`;
/** SQL: every CRM clinic of customer expression `k`. */
export const clinicsOfClientSql = (k: string) => `(SELECT b.clinic_id FROM daftra_client_branches b WHERE b.client_id=${k}
  UNION SELECT l.clinic_id FROM daftra_client_links l WHERE l.client_id=${k} AND l.clinic_id IS NOT NULL
  UNION SELECT cc.id FROM clinics cc WHERE cc.daftra_client_id=${k})`;

const lev = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const latinCore = (w: string) => w.replace(/^al(?=[a-z]{3,})/, "");
/** Pure: does a branch name belong to a Daftra customer name? "strong" = same Latin/Arabic brand word (one typo allowed),
 *  "weak" = only a transliteration look-alike (needs a human to confirm), false = no. */
export function branchMatch(customer: string, branch: string): "strong" | "weak" | false {
  const A = tokens(customer).map(latinCore).filter(w => w.length >= 3), B = tokens(branch).map(latinCore).filter(w => w.length >= 3);
  if (B.some(b => A.some(a => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1)))) return "strong";
  // Arabic ↔ Latin: compare consonant skeletons ("زارا" ~ "zara", "صولا" ~ "sola", "شام" ~ "cham")
  const sk = (w: string) => /[a-z]/.test(w) ? latinSkeleton(w) : arabicSkeleton(w);
  return B.some(b => A.some(a => /[a-z]/.test(a) !== /[a-z]/.test(b) && Math.max(a.length, b.length) >= 4 && sk(a).length >= 2 && sk(a) === sk(b))) ? "weak" : false;
}
const AR: Record<string, string> = { ب: "b", ت: "t", ث: "s", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "z", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "", غ: "gh", ف: "f", ق: "k", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ء: "", ئ: "", ؤ: "" };
const arabicSkeleton = (w: string) => [...w].map(ch => AR[ch] ?? "").join("");
const latinSkeleton = (w: string) => w.replace(/ch/g, "sh").replace(/q/g, "k").replace(/c/g, "k").replace(/[aeiouwy]/g, "").replace(/(.)\1+/g, "$1");

export type BranchClient = { client_id: number; name: string; primary_clinic_id: string | null; branches: Array<{ id: string; name: string; city: string; docs: number }>; suggestions: Array<{ id: string; name: string; city: string; docs: number; weak: boolean }> };

/** Admin screen data: every Daftra customer with its branches and suggested branches (clinics with doctors, not used by another customer). */
export async function branchClients(): Promise<{ clients: BranchClient[]; clinics: Array<{ id: string; name: string; city: string; docs: number; client_id: number | null }> }> {
  const [cl, clinics] = await Promise.all([
    query<{ client_id: string; name: string; primary_clinic_id: string | null }>(`SELECT i.client_id, max(i.client_name) name, (SELECT l.clinic_id FROM daftra_client_links l WHERE l.client_id=i.client_id) primary_clinic_id
      FROM daftra_invoices i WHERE i.client_id IS NOT NULL GROUP BY i.client_id ORDER BY sum(i.total) DESC`),
    query<{ id: string; name: string; city: string; docs: number; client_id: string | null; branch_of: string | null }>(`SELECT c.id, c.name, COALESCE(c.city,'') city,
        (SELECT count(*) FROM doctors d WHERE d.clinic_id=c.id AND COALESCE(d.status,'active')='active')::int docs, c.daftra_client_id client_id,
        (SELECT b.client_id FROM daftra_client_branches b WHERE b.clinic_id=c.id) branch_of
      FROM clinics c WHERE c.active ORDER BY c.name`),
  ]);
  const taken = new Map(clinics.rows.filter(c => c.branch_of).map(c => [c.id, Number(c.branch_of)]));
  const clients = cl.rows.map(c => {
    const id = Number(c.client_id);
    const branches = clinics.rows.filter(k => Number(k.branch_of) === id).map(({ id, name, city, docs }) => ({ id, name, city, docs }));
    const suggestions = clinics.rows.filter(k => !taken.has(k.id) && k.docs > 0 && !k.client_id).map(k => ({ k, m: branchMatch(c.name, k.name) })).filter(x => x.m)
      .map(({ k: { id, name, city, docs }, m }) => ({ id, name, city, docs, weak: m === "weak" })).sort((a, b) => Number(a.weak) - Number(b.weak));
    return { client_id: id, name: c.name, primary_clinic_id: c.primary_clinic_id, branches, suggestions };
  });
  return { clients, clinics: clinics.rows.map(c => ({ id: c.id, name: c.name, city: c.city, docs: c.docs, client_id: c.branch_of ? Number(c.branch_of) : null })) };
}
