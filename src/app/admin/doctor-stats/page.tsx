import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

// Doctor performance now lives as a tab inside the unified Reports workspace.
export default async function DoctorStatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  redirect("/admin/reports?tab=doctorStats");
}
