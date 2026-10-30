import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import SalesHub from "./SalesHub";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "sales_rep" && user.role !== "admin") redirect("/");
  const sp = await searchParams;
  const { query } = await import("@/lib/db");
  const reps = user.role === "admin" ? (await query("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows : [];
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/sales">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">المبيعات والأهداف</h1>
      <p className="text-sm text-[var(--muted)]">الهدف السنوي وتوزيعه، والتوقع الشهري، والمبيعات المعتمدة — في مكان واحد</p>
      <SalesHub isAdmin={user.role === "admin"} reps={reps as any} initialTab={sp.tab === "workspace" ? "workspace" : "overview"} />
    </AppShell>
  );
}
