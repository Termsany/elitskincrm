import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import TasksClient from "./TasksClient";
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }){
  const user=await getCurrentUser();
  if(!user) redirect("/login");
  const params = await searchParams;
  if(params.view!=="full") redirect("/work");
  const { query } = await import("@/lib/db");
  const reps = user.role==="admin" ? await query("SELECT id, name FROM users WHERE role='sales_rep' ORDER BY name") : {rows:[]};
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/work">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--navy)]">المهام</h1>
          <p className="text-sm text-[var(--muted)]">{user.role==="admin" ? "أنشئ مهام للمندوبين وتابع حالتها" : "مهامك — حدّث حالتها عند الإنجاز"}</p>
        </div>
      </div>
      <TasksClient isAdmin={user.role==="admin"} reps={reps.rows as any} currentUserId={user.id} />
    </AppShell>
  );
}
