import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { staleDoctors } from "@/lib/my-alerts";
import { query } from "@/lib/db";
import AlertsList from "./AlertsList";
import DecliningClients from "@/components/DecliningClients";
import { decliningClients } from "@/lib/clinic-account";
import { riyadhToday } from "@/lib/finance";

export default async function MyAlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/alerts");
  const [stale, declines] = await Promise.all([staleDoctors(user.id), decliningClients(user.id, riyadhToday()).catch(() => [])]);
  const freq = (await query<{ classification: string; visits_per_month: number }>("SELECT classification, visits_per_month FROM plan_frequencies WHERE visits_per_month > 0 ORDER BY classification")).rows;
  const rule = freq.map(f => `${f.classification} كل ${Math.ceil(30 / Number(f.visits_per_month))} يوم`).join(" · ");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">أطباء متأخرين</h1>
      <p className="text-sm text-[var(--muted)] mt-1">أطباء عدّى ميعاد زيارتهم حسب فئتهم{rule ? ` (${rule})` : ""}. الأطباء اللي وقفتهم الشهر ده مش ظاهرين هنا.</p>
      <AlertsList initial={JSON.parse(JSON.stringify(stale))} />
      <DecliningClients rows={declines} />
    </AppShell>
  );
}
