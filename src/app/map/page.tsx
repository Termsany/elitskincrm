import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import MapClient from "./MapClient";
export default async function MapPage(){
  const user = await getCurrentUser();
  if(!user) redirect("/login");
  if(user.role !== "admin") redirect("/");
  const { query } = await import("@/lib/db");
  const reps = await query("SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/map">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">خريطة الزيارات</h1>
      <p className="text-sm text-[var(--muted)]">زيارات اليوم على الخريطة</p>
      <MapClient isAdmin={user.role==="admin"} reps={reps.rows as any} />
    </AppShell>
  );
}
