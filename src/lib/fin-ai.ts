import type { computeFinance } from "@/lib/finance";

type Fin = ReturnType<typeof computeFinance>;
export type PrevKpi = { from: string; to: string; sales: number; cogs: number; gross: number; opex: number; other_income: number; net: number } | null;

/** Previous period of the same length, right before `from` (null when it falls before the books start). */
export function prevRange(from: string, to: string, booksStart?: string | null): [string, string] | null {
  const day = 864e5, f = Date.parse(`${from}T00:00:00Z`), t = Date.parse(`${to}T00:00:00Z`);
  const pt = new Date(f - day).toISOString().slice(0, 10), pf = new Date(f - day - (t - f)).toISOString().slice(0, 10);
  return booksStart && pf < booksStart ? null : [pf, pt];
}
export const prevKpi = (fin: Fin, from: string, to: string): PrevKpi =>
  ({ from, to, sales: fin.kpi.sales, cogs: fin.kpi.cogs, gross: fin.kpi.gross, opex: fin.kpi.opex, other_income: fin.kpi.other_income, net: fin.kpi.net });

/** The company's numbers the AI advisor may use, trimmed to what matters (amounts in SAR, before VAT). */
export function advisorContext(fin: Fin, prev: PrevKpi, today: string) {
  const top = <T,>(rows: T[], n: number) => rows.slice(0, n);
  return {
    today, currency: "SAR", period: fin.period, books_start: fin.books_start,
    kpi: fin.kpi, previous_period: prev,
    monthly: fin.monthly,
    baseline_monthly_average: fin.baseline, plan: fin.plan, targets: fin.settings, fixed_costs: fin.fixed.map(f => ({ name: f.name, category: f.category, monthly: f.monthly_amount })),
    sales_by_product: top(fin.salesByProduct, 25).map(p => ({ name: p.name, qty: p.qty, revenue: p.net, gross: p.gross, margin_pct: p.margin })),
    sales_by_client: top(fin.salesByClient, 20).map(c => ({ name: c.name, revenue: c.net, share_pct: c.share })),
    receivables: { total: fin.ar.total, overdue: fin.ar.overdue, buckets: fin.ar.buckets, top: top(fin.ar.parties, 15).map(p => ({ name: p.name, unpaid: p.unpaid, overdue: p.overdue, oldest_days_late: p.oldestDue })) },
  };
}

export const ADVISOR_SYSTEM = `أنت المستشار المالي (CFO) لشركة eliteSkin، شركة توزيع منتجات تجميل طبية في السعودية. صاحب الشركة بيسألك من صفحة الحسابات في نظام الـ CRM بتاعه، وهو مش محاسب.

هتلاقي تحت أرقام الشركة الفعلية من دفترة للفترة اللي هو فاتحها. دي المصدر الوحيد للأرقام: أي رقم تقوله لازم يكون منها أو محسوب منها، ولو المعلومة مش موجودة قول إنها مش موجودة في البيانات واقترح يبص فين. ما تخمّنش أرقام.

طريقة الرد:
- رد بالعامية المصرية، بلغة بسيطة من غير مصطلحات محاسبية إلا لو شرحتها في كلمتين.
- ابدأ بالإجابة أو الخلاصة في أول سطر، وبعدها السبب بالأرقام، وبعدها إيه اللي يتعمل.
- خليك مختصر: الرد العادي من 4 لـ 8 سطور. لو طلب تفاصيل أو خطة، طوّل براحتك.
- اكتب نص عادي من غير Markdown (من غير نجوم ولا # ولا جداول). لو محتاج قايمة، استخدم سطور بتبدأ بـ «- ».
- المبالغ بالريال السعودي وقبل الضريبة، واكتبها بفواصل الآلاف.
- لما تنصح، قول نصيحة محددة تتنفذ: مين العميل، أنهي منتج، كام ريال، قبل إمتى. رتب النصايح حسب أثرها على الربح والسيولة.
- لو الأرقام بتقول إن فيه خسارة أو خطر على السيولة، قولها بوضوح من غير تهويل.
- في البيانات جزء اسمه this_month_link بيربط أربع حاجات عن الشهر الحالي: المبيعات لحد النهارده وتوقع آخر الشهر (sales)، هدف الشهر من الأهداف السنوية (goals)، خطة الشهر المحفوظة (plan)، ومديونيات العملاء (ar). لما يسألك عن أي واحدة منهم، اربطها بالباقي: مثلاً الفرق عن الهدف يتقفل بأنهي عملاء أو منتجات، والتحصيل المتأخر يغطي كام من مصاريف الخطة. لو goals أو plan قيمتها null يبقى لسه ما اتعملوش، فانصحه يعملهم من تبويبهم.
- الحسابات بدأت من تاريخ books_start، فلو الفترة قصيرة نبّه إن المتوسطات لسه تقديرية.`;
