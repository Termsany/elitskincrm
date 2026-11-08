import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import OfficeTimeClient from "./OfficeTimeClient";

export default async function OfficeTimePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "sales_rep") redirect("/");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/visits/new">
      <OfficeTimeClient />
    </AppShell>
  );
}
