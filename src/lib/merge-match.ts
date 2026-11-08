/** Pure: find likely duplicate clinics and doctors (names typed differently for the same place / person). */

const AR: Array<[RegExp, string]> = [[/[أإآ]/g, "ا"], [/ة/g, "ه"], [/ى/g, "ي"], [/[ًٌٍَُِّْـ]/g, ""]];
const CLINIC_STOP = new Set(["clinic", "clinics", "center", "centre", "medical", "complex", "polyclinic", "co", "company", "عياده", "عيادات", "مركز", "مجمع", "طبي", "الطبي", "شركه"]);
const DR = /^(dr|doctor|د)\.?\s+|^د\./i;

export function arNorm(s: string) { let x = (s || "").toLowerCase().trim(); for (const [re, r] of AR) x = x.replace(re, r); return x; }
const words = (s: string) => arNorm(s).replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);

/** Compact clinic key: no punctuation/spaces, generic words dropped, and the clinic's own city dropped ("HOSN - Dammam" in Dammam → "hosn"). */
export function clinicKey(name: string, city = "") {
  const cityWords = new Set(words(city).flatMap(w => [w, w.replace(/^al/, "")]).concat(words(city).join("")));
  const w = words(name).filter(x => !CLINIC_STOP.has(x) && !cityWords.has(x) && !cityWords.has(x.replace(/^al/, "")) && x !== "al" && x !== "ال");
  return (w.join("") || words(name).join("")).replace(/^al(?=[a-z]{3,})/, "");
}
export function doctorKey(name: string) { return words(arNorm(name).replace(DR, "")).join("").replace(/^(dr|د)(?=[\p{L}]{4,})/u, ""); }

export function lev(a: string, b: string, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const sameCity = (a: string, b: string) => !a.trim() || !b.trim() || clinicKey(a) === clinicKey(b) || arNorm(a).replace(/^al\s*/, "") === arNorm(b).replace(/^al\s*/, "");

export type MClinic = { id: string; name: string; city: string; clients: number[]; doctors: number; visits: number };
export type MDoctor = { id: string; name: string; clinic_id: string | null; clinic_name: string; phone: string; visits: number };
export type Pair = { a: string; b: string; strength: "strong" | "possible"; why: string };

/** Same city and the same name once spelling noise is removed (or ≤2 typos on longer names). Never pairs clinics tied to different Daftra customers. */
export function clinicPairs(cs: MClinic[]): Pair[] {
  const out: Pair[] = [];
  const keys = cs.map(c => ({ c, k: clinicKey(c.name, c.city) }));
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const { c: x, k: kx } = keys[i], { c: y, k: ky } = keys[j];
    if (!kx || !ky || !sameCity(x.city, y.city)) continue;
    if (x.clients.length && y.clients.length && !x.clients.some(k => y.clients.includes(k))) continue;
    const d = kx === ky ? 0 : Math.min(kx.length, ky.length) >= 7 ? lev(kx, ky, 2) : 9;
    if (d <= 2) out.push({ a: x.id, b: y.id, strength: d === 0 ? "strong" : "possible", why: d === 0 ? "نفس الاسم بكتابة مختلفة" : "الاسم متشابه جداً (غلطة كتابة)" });
  }
  return out;
}

/** Same person: same name (spelling-normalised) in the same clinic or with the same phone = strong; same name in two clinics = possible (may really work in both). */
export function doctorPairs(ds: MDoctor[]): Pair[] {
  const out: Pair[] = [];
  const keys = ds.map(d => ({ d, k: doctorKey(d.name), p: (d.phone || "").replace(/\D/g, "").slice(-9) }));
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const { d: x, k: kx, p: px } = keys[i], { d: y, k: ky, p: py } = keys[j];
    if (kx.length < 4 || ky.length < 4) continue;
    const same = kx === ky, near = !same && Math.min(kx.length, ky.length) >= 8 && lev(kx, ky, 1) <= 1;
    if (!same && !near) continue;
    const phone = px.length >= 8 && px === py, clinic = !!x.clinic_id && x.clinic_id === y.clinic_id;
    if (near && !phone && !clinic) continue;
    out.push(phone || clinic ? { a: x.id, b: y.id, strength: "strong", why: phone ? "نفس الاسم ونفس التليفون" : same ? "نفس الاسم في نفس العيادة" : "الاسم متشابه جداً في نفس العيادة" }
      : { a: x.id, b: y.id, strength: "possible", why: "نفس الاسم في عيادتين — ممكن يكون بيشتغل في الاتنين" });
  }
  return out;
}
