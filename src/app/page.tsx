import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import OnboardingTour from "@/components/OnboardingTour";
import RepHome from "./RepHome";

/** Rep home (admins land on /admin — the Command Center). */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  const { query } = await import("@/lib/db");
  const onboarded = (await query("SELECT onboarded_at FROM users WHERE id=$1", [user.id])).rows[0]?.onboarded_at;
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
    <OnboardingTour show={!onboarded} />
    <RepHome />
  </AppShell>;
}
