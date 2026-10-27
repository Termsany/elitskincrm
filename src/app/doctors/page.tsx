import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import DoctorsClient from "./DoctorsClient";
import AdminDoctorsWorkspace from "./AdminDoctorsWorkspace";

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const q = sp.q || "";
  const { query } = await import("@/lib/db");
  const rows = await query(`SELECT d.id, d.name, d.clinic_name, d.city, d.specialty, d.classification, d.phone, d.email, d.status, max(v.visited_at) AS last_visit, count(v.id)::int AS visits_count, min(v.follow_up_at) FILTER (WHERE v.follow_up_at >= now()) AS next_follow_up FROM doctors d LEFT JOIN visits v ON v.doctor_id=d.id GROUP BY d.id ORDER BY d.name ASC`);
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/doctors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-[var(--navy)]">الأطباء والعيادات</h1>
        <div className="text-sm text-[var(--muted)]">{rows.rows.length} طبيب</div>
      </div>
      {user.role === "admin" ? <AdminDoctorsWorkspace initial={rows.rows as any} initialQ={q} /> : <DoctorsClient initial={rows.rows as any} initialQ={q} role={user.role} />}
    </AppShell>
  );
}
