import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import DoctorsHub from "./DoctorsHub";

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const { query } = await import("@/lib/db");
  const reps = user.role === "admin" ? (await query("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows : [];
  const tab = ["doctors", "clinics", "insights", "requests"].includes(sp.tab || "") ? sp.tab as "doctors" : "doctors";
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/doctors">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">الأطباء والعيادات</h1>
      <p className="text-sm text-[var(--muted)]">قائمة الأطباء وأداؤهم وتغطيتهم في مكان واحد — ابحث، رتّب بالأولوية، وأضف للخطة مباشرة</p>
      <DoctorsHub isAdmin={user.role === "admin"} reps={reps as any} initialQ={sp.q || ""} initialTab={tab} />
    </AppShell>
  );
}
