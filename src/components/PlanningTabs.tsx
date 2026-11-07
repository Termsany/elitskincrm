import Link from "next/link";

/** Planning lives in one place: the calendar (what's on each day) and the plans (build, submit, approve). */
export default function PlanningTabs({ active }: { active: "calendar" | "plans" }) {
  const tab = (key: "calendar" | "plans", href: string, label: string, sub: string) => <Link href={href} aria-current={active === key ? "page" : undefined}
    className={`flex min-h-11 flex-1 flex-col justify-center rounded-xl px-4 py-2 text-right transition sm:flex-none ${active === key ? "bg-[var(--navy)] text-white shadow" : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--navy)]"}`}>
    <span className="text-sm font-extrabold">{label}</span><span className={`text-[11px] ${active === key ? "text-white/70" : ""}`}>{sub}</span></Link>;
  return <nav aria-label="الخطة" className="mb-4 flex gap-1 rounded-2xl border border-[var(--border)] bg-white p-1.5">
    {tab("calendar", "/calendar", "التقويم", "زياراتك ومواعيدك يوم بيوم")}
    {tab("plans", "/plans", "الخطط والاعتماد", "رتّب الخطة وابعتها للاعتماد")}
  </nav>;
}
