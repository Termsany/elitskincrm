export const REPORT_TYPES = ["reps", "visits", "products", "samples", "sampleDoctors", "coverage", "sales", "compliance"] as const;
export type ReportType = typeof REPORT_TYPES[number];

export function normalizeReportType(value: string | null): ReportType {
  return REPORT_TYPES.includes(value as ReportType) ? value as ReportType : "reps";
}

export function reportTitle(type: ReportType) {
  return ({
    reps: "أداء المناديب",
    visits: "تفاصيل الزيارات",
    products: "أداء المنتجات",
    samples: "تفاصيل توزيع العينات",
    sampleDoctors: "الأطباء الذين حصلوا على عينات",
    coverage: "Coverage الأطباء",
    sales: "الأهداف والمبيعات",
    compliance: "الالتزام بالخطة",
  } as const)[type];
}

export type ReportColumn = { key: string; label: string };
export function reportDefinition(type: ReportType): { source: "repPerformance"|"visits"|"products"|"samples"|"sampleDoctors"|"coverage"|"sales"|"compliance"; columns: ReportColumn[] } {
  const definitions: Record<ReportType,{ source: "repPerformance"|"visits"|"products"|"samples"|"sampleDoctors"|"coverage"|"sales"|"compliance"; columns: ReportColumn[] }> = {
    reps:{source:"repPerformance",columns:[{key:"rep_name",label:"المندوب"},{key:"assigned_product",label:"المنتج"},{key:"visits",label:"الزيارات"},{key:"completed_visits",label:"الزيارات المكتملة"},{key:"unique_doctors",label:"الأطباء"},{key:"samples",label:"العينات"},{key:"orders",label:"الأوردر"},{key:"last_visit",label:"آخر زيارة"}]},
    visits:{source:"visits",columns:[{key:"visited_at",label:"التاريخ"},{key:"rep_name",label:"المندوب"},{key:"doctor_name",label:"الطبيب"},{key:"clinic_name",label:"العيادة"},{key:"city",label:"المدينة"},{key:"status",label:"الحالة"},{key:"presented_products",label:"شرح المنتجات ورد الفعل"},{key:"samples",label:"العينات"},{key:"sample_products",label:"منتجات العينات"},{key:"orders",label:"الأوردر"},{key:"order_products",label:"منتجات الأوردر"},{key:"notes",label:"الملاحظات"}]},
    products:{source:"products",columns:[{key:"product_name",label:"المنتج"},{key:"presented",label:"تم شرحه"},{key:"interested",label:"مهتم"},{key:"neutral",label:"محايد"},{key:"not_interested",label:"غير مهتم"},{key:"visits",label:"الزيارات"},{key:"reps",label:"المناديب"},{key:"doctors",label:"الأطباء"},{key:"samples",label:"العينات"},{key:"orders",label:"الأوردر"},{key:"last_activity",label:"آخر نشاط"}]},
    samples:{source:"samples",columns:[{key:"visited_at",label:"التاريخ"},{key:"rep_name",label:"المندوب"},{key:"doctor_name",label:"الطبيب"},{key:"clinic_name",label:"العيادة"},{key:"city",label:"المدينة"},{key:"product_name",label:"المنتج"},{key:"quantity",label:"الكمية"},{key:"sample_purpose",label:"الغرض"}]},
    sampleDoctors:{source:"sampleDoctors",columns:[{key:"doctor_name",label:"الطبيب"},{key:"clinic_name",label:"العيادة"},{key:"city",label:"المدينة"},{key:"sample_visits",label:"زيارات العينات"},{key:"samples",label:"إجمالي العينات"},{key:"products",label:"المنتجات"},{key:"reps",label:"المناديب"},{key:"last_sample",label:"آخر عينة"}]},
    coverage:{source:"coverage",columns:[{key:"doctor_name",label:"الطبيب"},{key:"classification",label:"التصنيف"},{key:"clinic_name",label:"العيادة"},{key:"city",label:"المدينة"},{key:"rep_name",label:"المندوب"},{key:"monthly_target",label:"المطلوب شهريًا"},{key:"actual_visits",label:"المنفذ"},{key:"last_visit",label:"آخر زيارة"}]},
    sales:{source:"sales",columns:[{key:"rep_name",label:"المندوب"},{key:"annual_sales_target",label:"الهدف السنوي"},{key:"achieved",label:"المبيعات المحققة"},{key:"remaining",label:"المتبقي"}]},
    compliance:{source:"compliance",columns:[{key:"rep_name",label:"المندوب"},{key:"planned",label:"المخطط"},{key:"completed",label:"المنفذ"}]},
  };
  return definitions[type];
}
