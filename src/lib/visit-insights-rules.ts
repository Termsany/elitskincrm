/** Pure keyword rules for visit notes — safe to import in the browser (the visit form shows them live). */
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

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Relative timing words → a date counted from the visit day. */
export function followUpFrom(text: string, day: string): { date: string; reason: string } | null {
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
