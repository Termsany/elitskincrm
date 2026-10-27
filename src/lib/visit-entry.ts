export type SamplePurpose = "personal_use" | "video_shooting" | "workshop";
export type Reaction = "interested" | "neutral" | "not_interested";

export const REACTION_LABELS: Record<string, string> = {
  interested: "مهتم",
  neutral: "محايد",
  not_interested: "غير مهتم",
};

export const PURPOSE_LABELS: Record<SamplePurpose, string> = {
  personal_use: "تجربة المنتج",
  video_shooting: "عرض / تصوير",
  workshop: "ورشة",
};

export function buildSampleItems(quantity:number,productId:string,purpose?:SamplePurpose){
  if(quantity<=0)return [];
  if(!productId)throw new Error("حدد نوع العينة الطبية");
  if(!purpose)throw new Error("حدد هدف العينة");
  return [{productId,quantity,purpose}];
}

export type SampleRow = { productId: string; quantity: number; purpose: SamplePurpose | "" };

/** Turns the "did the doctor take a sample?" answer into API items, requiring a reason for each. */
export function collectSampleItems(mode: "yes" | "no", rows: SampleRow[]): { items: Array<{ productId: string; quantity: number; purpose: SamplePurpose }>; error: string | null } {
  if (mode === "no") return { items: [], error: null };
  const active = rows.filter((row) => row.quantity > 0);
  if (!active.length) return { items: [], error: "اختر عينة واحدة على الأقل وحدد كميتها" };
  if (active.some((row) => !row.purpose)) return { items: [], error: "حدد سبب كل عينة قبل الحفظ" };
  return { items: active.map((row) => ({ productId: row.productId, quantity: row.quantity, purpose: row.purpose as SamplePurpose })), error: null };
}

/** Server-side rule: products are unique and every sample must be one of the presented products. */
export function validateVisitProducts(presentedIds: string[], sampleIds: string[]): string | null {
  if (new Set(presentedIds).size !== presentedIds.length) return "منتج مكرر في المنتجات المشروحة";
  if (new Set(sampleIds).size !== sampleIds.length) return "منتج مكرر في العينات";
  const presented = new Set(presentedIds);
  if (sampleIds.some((id) => !presented.has(id))) return "العينة يجب أن تكون من المنتجات التي شُرحت للطبيب";
  return null;
}
