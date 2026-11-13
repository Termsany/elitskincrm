/** Pure: who to visit next and why — one score and one plain-words reason per doctor, plus the smart search. */

export type PDoctor = { classification: string | null; gap_days: number | null; days_since: number | null; next_follow_up: string | null; follow_up_note?: string | null;
  in_plan_next: string | null; paused: boolean; hot_product: string | null; city: string | null };
export type PBal = { overdue: number; due: boolean; last_order: string | null } | null | undefined;
export type Tag = "a_late" | "late" | "followup" | "hot" | "reorder" | "never" | "debt" | "planned";
export type Tone = "red" | "amber" | "teal" | "gold" | "slate" | "navy" | "green";
export type Prio = { score: number; reason: string; icon: string; tone: Tone; tags: Tag[] };

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const short = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

/** Next Saudi working day (Fri/Sat off). */
export function nextWorkDay(today: string) {
  let x = t(today); do { x += DAY; } while ([5, 6].includes(new Date(x).getUTCDay()));
  return new Date(x).toISOString().slice(0, 10);
}

export function priority(d: PDoctor, b: PBal, today: string): Prio {
  const tags: Tag[] = [];
  const cls = (d.classification || "").toUpperCase();
  const late = d.days_since !== null && !!d.gap_days && d.days_since > d.gap_days;
  const lateBy = late ? d.days_since! - d.gap_days! : 0;
  const fuDue = !!d.next_follow_up && d.next_follow_up.slice(0, 10) <= today;
  const never = d.days_since === null;
  // "late" = needs planning: overdue, not paused this month, not already in an upcoming plan (same set as the rep's badge).
  const needsPlan = late && !d.paused && !d.in_plan_next;
  if (needsPlan) tags.push("late"); if (needsPlan && cls === "A") tags.push("a_late");
  if (fuDue) tags.push("followup"); if (d.hot_product) tags.push("hot"); if (b?.due) tags.push("reorder");
  if (never) tags.push("never"); if (b && b.overdue > 0) tags.push("debt"); if (d.in_plan_next) tags.push("planned");

  const clsW = cls === "A" ? 3 : cls === "B" ? 2 : 1;
  let score = 0;
  if (fuDue) score += 70;
  if (late) score += 15 * clsW + Math.min(lateBy, 30) / 2;
  if (d.hot_product) score += 30;
  if (b?.due) score += 22;
  if (never) score += 8 * clsW;
  if (!late && d.days_since !== null && d.gap_days && d.days_since > d.gap_days * 0.75) score += 4 * clsW;
  if (d.in_plan_next) score -= 25;
  if (d.paused) score -= 200;

  // the card's money line already shows the clinic's debt; the reason only adds the reorder hint
  const extra = [b?.due ? (b.overdue > 0 ? "العيادة جه ميعاد طلبها بس عليها متأخرات" : "العيادة جه ميعاد طلبها") : ""].filter(Boolean);
  const join = (main: string, more: string[] = extra) => [main, ...more].join(" · ");
  let r: Omit<Prio, "score" | "tags">;
  if (d.paused) r = { icon: "⏸", tone: "slate", reason: "Inactive الشهر ده — مش في حساب التغطية" };
  else if (fuDue) r = { icon: "↻", tone: "amber", reason: join(`متابعة ${d.next_follow_up!.slice(0, 10) < today ? `من ${short(d.next_follow_up!)}` : "النهارده"}${d.follow_up_note ? `: ${d.follow_up_note}` : ""}`) };
  else if (late && cls === "A") r = { icon: "⚠️", tone: "red", reason: join(`A · متأخر ${lateBy} يوم`) };
  else if (d.hot_product) r = { icon: "🔥", tone: "teal", reason: join(`مهتم بـ ${d.hot_product} ومفيش طلب من العيادة لسه`, extra.filter(x => !x.includes("ميعاد"))) };
  else if (late) r = { icon: "⏰", tone: "red", reason: join(`${cls || "—"} · متأخر ${lateBy} يوم`) };
  else if (b?.due) r = { icon: "📦", tone: "gold", reason: b.overdue > 0 ? "العيادة جه ميعاد طلبها — اسأل عن السداد الأول قبل أي طلب جديد" : "العيادة جه ميعاد طلبها — فرصة طلب" };
  else if (never) r = { icon: "✨", tone: "slate", reason: join("ما اتزارش خالص — فرصة جديدة") };
  else if (d.in_plan_next) r = { icon: "🗓", tone: "navy", reason: `في خطتك يوم ${short(d.in_plan_next)}` };
  else r = { icon: "✓", tone: "green", reason: join(`في الميعاد${d.gap_days && d.days_since !== null ? ` · الزيارة الجاية بعد ${Math.max(0, d.gap_days - d.days_since)} يوم` : ""}`) };
  if (d.in_plan_next && !d.paused && r.tone !== "navy") r = { ...r, reason: `${r.reason} · 🗓 في الخطة ${short(d.in_plan_next)}` };
  return { score: Math.round(score * 10) / 10, tags, ...r };
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
const WORDS: Array<[RegExp, Tag]> = [[/^متاخر(ين|ه)?$|^late$/, "late"], [/^متابع(ه|ات)$|^followups?$/, "followup"], [/^مهتم(ين)?$|^hot$/, "hot"],
  [/^(ما|مش)?اتزار(وش|ش)?$|^جديد$|^never$/, "never"], [/^مديوني(ه|ات)$|^متاخرات$|^debt$/, "debt"], [/^(ال)?خطه$|^planned$/, "planned"], [/^طلب$|^reorder$/, "reorder"]];

const CITY_AR: Record<string, string> = { "خبر": "khobar", "دمام": "dammam", "ظهران": "dhahran", "جبيل": "jubail", "قطيف": "qatif", "رياض": "riyadh", "جده": "jeddah", "احساء": "ahsa", "هفوف": "hofuf", "سيهات": "saihat", "خفجي": "khafji" };
/** "A متأخر الخبر" → class A + late + city الخبر; anything not understood stays free text. */
export function parseSmart(q: string, cities: string[]) {
  const out: { cls: string; tags: Tag[]; city: string; text: string } = { cls: "", tags: [], city: "", text: "" };
  const rest: string[] = [];
  const cs = cities.map(c => ({ c, n: norm(c).replace(/^al\s+/, "").replace(/^ال/, "") }));
  for (const raw of q.trim().split(/\s+/).filter(Boolean)) {
    const w = norm(raw).replace(/^فئه$/, "");
    if (!w) continue;
    if (/^[abc]$/i.test(w)) { out.cls = w.toUpperCase(); continue; }
    const tag = WORDS.find(([re]) => re.test(w.replace(/\s/g, "")))?.[1];
    if (tag) { if (!out.tags.includes(tag)) out.tags.push(tag); continue; }
    const bare = w.replace(/^al/, "").replace(/^ال/, "");
    const stem = CITY_AR[bare] || bare;
    const city = stem.length >= 3 ? cs.find(x => x.n === stem || x.n.startsWith(stem) || x.n.includes(stem) || norm(x.c) === w) : undefined;
    if (city && !out.city) { out.city = city.c; continue; }
    rest.push(raw);
  }
  out.text = rest.join(" ");
  return out;
}
