/** Two levels only: "important" needs the reader to act; "info" is FYI. Badge counts important ones. Pure (shared client/server). */
export const INFO_KINDS = [
  "plan_approved", "expense_approved", "expense_reimbursed", "doctor_request_approved", "visit_weekly_report", "document_signed", "sign_request_done",
  "calendar_confirmed", "service_request_cancelled", "comment", "task_completed", "order_approved",
];
export const levelOf = (kind: string): "important" | "info" => (INFO_KINDS.includes(kind) ? "info" : "important");

/** Group title when several notifications of one kind pile up. */
export const GROUP_LABEL: Record<string, string> = {
  plan_pending: "خطط مستنية موافقتك", expense_pending: "مصروفات مستنية اعتمادك", service_request_created: "طلبات جديدة من المناديب",
  sign_request: "طلبات توقيع", collaboration_request: "طلبات تعاون", daily_plan: "تذكيرات خطة اليوم", plan_approved: "خطط اتعتمدت",
  service_request_cancelled: "طلبات اتلغت", doctor_request_approved: "طلبات أطباء اتقبلت", visit_weekly_report: "تقارير أسبوعية",
  service_request_updated: "تحديثات على طلباتك", reminder: "تذكيرات", assigned: "مهام جديدة", morning_summary: "ملخص الصبح", finance_brief: "ملخص المستشار المالي", plan_behind: "تنبيهات خطة الشهر", plan_review: "مراجعات الخطة", smart_daily: "اقتراحات النهارده", plan_draft: "مسودات خطط", week_wrap: "ملخص الأسبوع",
};

/** Notifications the reader can approve straight from the bell (admin). */
export const QUICK_APPROVE = ["plan_pending", "expense_pending"];
