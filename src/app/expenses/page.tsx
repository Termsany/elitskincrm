import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { query } from "@/lib/db";
import ExpensesRep from "./ExpensesRep";
import ExpensesAdmin from "./ExpensesAdmin";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const isAdmin = user.role === "admin";
  const doctors = isAdmin ? [] : (await query("SELECT id, name, clinic_name, city FROM doctors WHERE status IS DISTINCT FROM 'inactive' ORDER BY name LIMIT 2000")).rows;
  const reps = isAdmin ? (await query("SELECT id, name FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows : [];
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/expenses">
    <h1 className="text-2xl font-extrabold text-[var(--navy)]">{isAdmin ? "المصروفات والربحية" : "مصروفاتي"}</h1>
    <p className="text-sm text-[var(--muted)]">{isAdmin ? "اعتماد مصروفات المناديب، صرفها، وربحية كل مندوب مقابل مبيعاته" : "سجّل مصروفك بالإيصال من جوالك، وتابع اعتماده وصرفه"}</p>
    {isAdmin ? <ExpensesAdmin reps={reps as Array<{ id: string; name: string }>} initialTab={["review", "all", "pnl", "settings"].includes(sp.tab || "") ? sp.tab as "review" : "review"} />
      : <ExpensesRep doctors={doctors as Array<{ id: string; name: string; clinic_name: string | null; city: string | null }>} />}
  </AppShell>;
}
