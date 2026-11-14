import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import ReportsHub from "./ReportsHub";
import { aiStatus } from "@/lib/ai-provider";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const sp = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => typeof v === "string" ? [[k, v]] : []));
  const { query } = await import("@/lib/db");
  const [reps, products, cities, ai] = await Promise.all([
    query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name"),
    query<{ id: string; name: string }>("SELECT id, name FROM products ORDER BY active DESC, name"),
    query<{ city: string }>("SELECT DISTINCT btrim(city) city FROM doctors WHERE btrim(COALESCE(city,''))<>'' ORDER BY 1"),
    aiStatus().catch(() => ({ configured: false })),
  ]);
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin/reports">
      <h1 className="mb-3 text-2xl font-extrabold text-[var(--navy)]">التقارير</h1>
      <ReportsHub reps={reps.rows} products={products.rows} cities={cities.rows.map(r => r.city)} manager={!!user.manager} ai={ai.configured} aiSetup={!user.manager} search={sp.toString()} />
    </AppShell>
  );
}
