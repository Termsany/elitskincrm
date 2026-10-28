import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import VisitsClient from "./VisitsClient";
import AdminVisitsOverview from "../admin/visits/AdminVisitsOverview";

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ repId?: string; status?: string; from?: string; to?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { query } = await import("@/lib/db");
  const reps = await query("SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name");
  const sp = await searchParams;
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/visits">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[var(--navy)]">الزيارات</h1>
        <div className="text-sm text-[var(--muted)]">بحث وفلترة وتصدير وتعديل</div>
      </div>
      <div className="mt-4">
        {user.role==="admin" && <AdminVisitsOverview selectedRepId={sp.repId||""} />}
        <VisitsClient isAdmin={user.role==="admin"} reps={reps.rows as any} initialRepId={sp.repId||""} initialStatus={sp.status||""} initialFrom={sp.from||""} initialTo={sp.to||""} initialQuery={sp.q||""} />
      </div>
    </AppShell>
  );
}
