import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";
export default async function AccountPage(){
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/account">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">حسابي</h1>
      <AccountClient email={user.email} />
    </AppShell>
  );
}
