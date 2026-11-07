import { query } from "@/lib/db";

/**
 * Turns free visit notes (Arabic, English or mixed) into structured insights: objections, positive signals,
 * the next step and a follow-up date when the note mentions one. Rules always run; when ANTHROPIC_API_KEY is set
 * on the server, Claude refines them (and the rules stay as the fallback).
 */
export type Insights = { objections: string[]; positives: string[]; next: string | null; follow_up: { date: string; reason: string } | null; sentiment: "positive" | "neutral" | "negative"; source: "rules" | "ai" };

export const OBJECTIONS: Record<string, string> = { price: "السعر", competitor: "منافس", stock: "المخزون / التوريد", not_tried: "لسه ما جربش", busy: "مشغول / ما اتكلمناش", side_effects: "آثار جانبية / نتيجة", no_interest: "مش مهتم", trust: "محتاج ثقة / دليل" };
export const POSITIVES: Record<string, string> = { interested: "مهتم", will_try: "هيجرب", using: "بيستخدم المنتج", recommend: "هيوصف / يرشح", order: "طلب / أوردر", samples: "طلب عينات", event: "أكد حضور فعالية" };

const R = (s: string) => new RegExp(s, "i");
const RULES_OBJ: Array<[string, RegExp]> = [
  ["price", R("سعر|غالي|غاليه|غالية|تكلف|خصم|discount|price|expensive|cost")],
  ["competitor", R("منافس|شركة تانية|شركه اخرى|بديل|competitor|another brand|other company")],
  ["stock", R("مخزون|ستوك|نفذ|خلص|توريد|stock|out of|supply")],
  ["not_tried", R("لم (يجرب|تجرب)|ما جربش|لسه ما|حتى الآن|not tried|didn.?t try|hasn.?t tried")],
  ["busy", R("مشغول|مشغوله|مشغولة|لم نتحدث|ما اتكلمناش|busy|no time")],
  ["side_effects", R("آثار|اثار جانبية|حساسية|ما جابش نتيجة|side effect|no result|irritation")],
  ["no_interest", R("غير مهتم|مش مهتم|رفض|يرفض|ترفض|not interested|refus")],
  ["trust", R("ثقة|الثقه|دراسات|دليل|evidence|study|trust")],
];
const RULES_POS: Array<[string, RegExp]> = [
  ["interested", R("مهتم|مهتمه|مهتمة|اعجب|أعجب|interested|liked")],
  ["will_try", R("هيجرب|هتجرب|سيجرب|ستجرب|will try|going to try")],
  ["using", R("استخدم|يستخدم|تستخدم|used|using|uses")],
  ["recommend", R("هيوصف|يوصف|يرشح|will recommend|prescrib|recommend")],
  ["order", R("طلب (كمية|اوردر|أوردر)|اوردر|أوردر|order")],
  ["samples", R("عين(ة|ات|ه)|sample")],
  ["event", R("أكد|اكد|confirmed|attend|حضور|invitation|دعوة")],
];

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Relative timing words → a date counted from the visit day. */
function followUpFrom(text: string, day: string): { date: string; reason: string } | null {
  const m: Array<[RegExp, number, string]> = [
    [R("بكره|بكرة|غدا|غداً|tomorrow"), 1, "بكرة"], [R("بعد يومين|in 2 days"), 2, "بعد يومين"],
    [R("الأسبوع الجاي|الاسبوع الجاي|الأسبوع القادم|الاسبوع القادم|next week"), 7, "الأسبوع الجاي"], [R("بعد أسبوعين|بعد اسبوعين|in two weeks|2 weeks"), 14, "بعد أسبوعين"],
    [R("الشهر الجاي|الشهر القادم|next month|بعد شهر"), 30, "الشهر الجاي"],
    [R("هيرجع|هترجع|يرجعلي|ترجعلي|هيكلمني|هتكلمني|waiting|متابعة|follow ?up|call back|will call"), 7, "مستني رد"],
  ];
  for (const [re, n, reason] of m) if (re.test(text)) return { date: addDays(day, n), reason };
  return null;
}

/** Pure: keyword rules. */
export function ruleInsights(notes: string, day: string): Insights {
  const text = (notes || "").toLowerCase();
  const objections = RULES_OBJ.filter(([, re]) => re.test(text)).map(([k]) => k);
  const positives = RULES_POS.filter(([, re]) => re.test(text)).map(([k]) => k).filter(k => !(k === "interested" && objections.includes("no_interest")));
  const follow_up = followUpFrom(text, day);
  const next = objections.includes("price") ? "جهّز عرض سعر أو باقة" : objections.includes("not_tried") || objections.includes("trust") ? "ابعت عينة ودراسة / حالة قبل وبعد"
    : positives.includes("samples") ? "وصّل العينات وتابع النتيجة" : positives.includes("will_try") ? "تابع نتيجة التجربة" : follow_up ? "متابعة" : null;
  const score = positives.length - objections.filter(o => o !== "busy").length;
  return { objections, positives, next, follow_up, sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral", source: "rules" };
}

/** Optional AI pass (Claude). Returns null on any problem so the rules result stands. */
async function aiInsights(notes: string, day: string): Promise<Insights | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || (notes || "").trim().length < 12) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: 300, messages: [{ role: "user", content:
        `Medical sales rep visit note (Arabic/English) from ${day}:\n"""${notes.slice(0, 1500)}"""\nReturn ONLY JSON: {"objections":[subset of ${Object.keys(OBJECTIONS).join(",")}],"positives":[subset of ${Object.keys(POSITIVES).join(",")}],"next":"next step in short Egyptian Arabic or null","follow_up_days":number|null,"follow_up_reason":"short Arabic or null","sentiment":"positive|neutral|negative"}` }] }),
    });
    if (!r.ok) return null;
    const j = await r.json() as { content?: Array<{ text?: string }> };
    const raw = (j.content?.[0]?.text || "").match(/\{[\s\S]*\}/)?.[0]; if (!raw) return null;
    const o = JSON.parse(raw) as { objections?: string[]; positives?: string[]; next?: string | null; follow_up_days?: number | null; follow_up_reason?: string | null; sentiment?: string };
    const days = Number(o.follow_up_days);
    return { objections: (o.objections || []).filter(k => k in OBJECTIONS), positives: (o.positives || []).filter(k => k in POSITIVES), next: o.next ? String(o.next).slice(0, 120) : null,
      follow_up: days > 0 && days <= 90 ? { date: addDays(day, Math.round(days)), reason: String(o.follow_up_reason || "متابعة").slice(0, 60) } : null,
      sentiment: o.sentiment === "positive" || o.sentiment === "negative" ? o.sentiment : "neutral", source: "ai" };
  } catch { return null; }
}

/** Analyse one visit, store the insights, and add a follow-up date when the note asks for one and none was set. */
export async function analyzeVisit(visitId: string) {
  const v = (await query<{ notes: string; day: string; follow_up_at: string | null; status: string }>(`SELECT notes, (visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day, follow_up_at::text follow_up_at, status::text status FROM visits WHERE id=$1`, [visitId])).rows[0];
  if (!v) return null;
  const ins = (await aiInsights(v.notes, v.day)) || ruleInsights(v.notes, v.day);
  await query("UPDATE visits SET insights=$2, insights_at=now() WHERE id=$1", [visitId, JSON.stringify(ins)]);
  if (ins.follow_up && !v.follow_up_at && v.status !== "cancelled" && ins.follow_up.date > v.day)
    await query("UPDATE visits SET follow_up_at=$2, follow_up_note=CASE WHEN COALESCE(follow_up_note,'')='' THEN $3 ELSE follow_up_note END WHERE id=$1 AND follow_up_at IS NULL", [visitId, ins.follow_up.date, `تلقائي: ${ins.follow_up.reason}${ins.next ? ` — ${ins.next}` : ""}`]);
  return ins;
}

/** Analyse visits that have notes but no insights yet (used on deploy and nightly). No auto follow-ups for old visits. */
export async function backfillInsights(limit = 500) {
  const rows = (await query<{ id: string; notes: string; day: string }>(`SELECT id, notes, (visited_at AT TIME ZONE 'Asia/Riyadh')::date::text AS day FROM visits WHERE insights IS NULL AND length(coalesce(notes,'')) > 0 ORDER BY visited_at DESC LIMIT $1`, [limit])).rows;
  for (const r of rows) await query("UPDATE visits SET insights=$2, insights_at=now() WHERE id=$1", [r.id, JSON.stringify(ruleInsights(r.notes, r.day))]);
  return rows.length;
}
