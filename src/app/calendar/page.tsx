import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import WorkPlanner from "./WorkPlanner";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { query } = await import("@/lib/db");
  const reps = await query("SELECT id, name FROM users WHERE role='sales_rep' AND active=true ORDER BY name");
  const doctors = await query("SELECT id, name, clinic_name, city, classification FROM doctors WHERE status='active' ORDER BY name");
  const products = await query("SELECT id, name FROM products WHERE active=true ORDER BY sort_order, name");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/calendar">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--navy)]">مخطط العمل</h1>
          <p className="text-sm text-[var(--muted)]">الخطة والزيارات والمواعيد والمتابعات وطلبات التعاون — في مكان واحد</p>
        </div>
      </div>
      <WorkPlanner isAdmin={user.role === "admin"} currentUserId={user.id} reps={reps.rows as any} doctors={doctors.rows as any} products={products.rows as any} />
    </AppShell>
  );
}
