export type DashboardRole = "admin" | "sales_rep";

export type DashboardQuickLink = {
  href: string;
  label: string;
  detail: string;
  icon: string;
};

export type DashboardMobileLink = {
  href: string;
  label: string;
  icon: string;
  primary?: boolean;
};

const REP_LINKS: DashboardQuickLink[] = [
  { href: "/visits/new", label: "تسجيل زيارة", detail: "ابدأ الزيارة واحفظ النتائج والعينات", icon: "new-visit" },
  { href: "/doctors", label: "الأطباء", detail: "ملفات الأطباء والمتابعات والمفضلة", icon: "doctors" },
  { href: "/plans", label: "الخطط", detail: "رتّب خطتك وتابع التنفيذ", icon: "plans" },
  { href: "/products", label: "المنتجات", detail: "العروض والبروشورات و e-Detailing", icon: "products" },
  { href: "/tasks", label: "المهام", detail: "المهام المطلوبة والمتأخرة", icon: "tasks" },
  { href: "/sales", label: "المبيعات", detail: "الهدف السنوي والأداء الشهري", icon: "sales" },
];

const ADMIN_LINKS: DashboardQuickLink[] = [
  { href: "/work", label: "مركز العمل", detail: "التنبيهات والطلبات والمهام والإجراءات الموحدة", icon: "work" },
  { href: "/admin/reps", label: "المناديب", detail: "الأداء والحسابات والخطط والمبيعات", icon: "reps" },
  { href: "/plans", label: "الخطط", detail: "المراجعة والتغطية وتقويم التنفيذ", icon: "plans" },
  { href: "/visits", label: "الزيارات", detail: "متابعة الزيارات والنتائج والعينات", icon: "visits" },
  { href: "/admin/doctor-stats", label: "أداء الأطباء", detail: "التغطية والزيارات والنتائج حسب الطبيب", icon: "doctor-stats" },
  { href: "/admin/reports", label: "التقارير", detail: "التغطية والالتزام والمبيعات", icon: "reports" },
];

const REP_MOBILE_LINKS: DashboardMobileLink[] = [
  { href: "/", label: "الرئيسية", icon: "dashboard" },
  { href: "/doctors", label: "الأطباء", icon: "doctors" },
  { href: "/visits/new", label: "زيارة", icon: "new-visit", primary: true },
  { href: "/work", label: "عملي", icon: "work" },
  { href: "#more", label: "المزيد", icon: "more" },
];

const ADMIN_MOBILE_LINKS: DashboardMobileLink[] = [
  { href: "/admin", label: "الرئيسية", icon: "dashboard" },
  { href: "/work", label: "العمل", icon: "work" },
  { href: "/admin/reps", label: "المناديب", icon: "reps" },
  { href: "/admin/reports", label: "التقارير", icon: "reports" },
  { href: "#more", label: "المزيد", icon: "more" },
];

export function dashboardQuickLinks(role: DashboardRole): DashboardQuickLink[] {
  return role === "admin" ? ADMIN_LINKS : REP_LINKS;
}

export function dashboardMobileLinks(role: DashboardRole): DashboardMobileLink[] {
  return role === "admin" ? ADMIN_MOBILE_LINKS : REP_MOBILE_LINKS;
}

export function performanceTone(percentage: number): "good" | "watch" | "risk" | "unknown" {
  if (!Number.isFinite(percentage)) return "unknown";
  if (percentage >= 75) return "good";
  if (percentage >= 50) return "watch";
  return "risk";
}

export function salesAttainment(targetValue: number, achievedValue: number) {
  const target = Math.max(0, Number(targetValue) || 0);
  const achieved = Math.max(0, Number(achievedValue) || 0);
  return {
    target,
    achieved,
    remaining: Math.max(0, target - achieved),
    percentage: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
  };
}
