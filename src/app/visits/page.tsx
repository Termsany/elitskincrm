import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import VisitsClient from "./VisitsClient";
import VisitsHub from "../admin/visits/VisitsHub";

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ repId?: string; day?: string; tab?: string; visit?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { query } = await import("@/lib/db");
  const sp = await searchParams;
  const isAdmin = user.role === "admin";
  const reps = await query(isAdmin ? "SELECT id::text id, name FROM users WHERE role='sales_rep' AND active ORDER BY name" : "SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name");
  const products = isAdmin ? (await query("SELECT id::text id, name FROM products ORDER BY sort_order, name")).rows : [];
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/visits">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">الزيارات</h1>
      <p className="text-sm text-[var(--muted)]">{isAdmin ? "تابع المناديب لحظة بلحظة، جودة كل زيارة، والتقارير — في مكان واحد" : "بحث وفلترة وتصدير وتعديل"}</p>
      {isAdmin
        ? <VisitsHub reps={reps.rows as any} products={products as any} initialTab={sp.tab} initialVisit={/^[0-9a-f-]{36}$/i.test(sp.visit || "") ? sp.visit : undefined} initialRepId={sp.repId || ""} initialDay={/^\d{4}-\d{2}-\d{2}$/.test(sp.day || "") ? sp.day : ""} />
        : <div className="mt-4"><VisitsClient isAdmin={false} reps={reps.rows as any} initialRepId={sp.repId || ""} /></div>}
    </AppShell>
  );
}
