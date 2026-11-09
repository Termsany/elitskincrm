import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import ReviewClient from "./ReviewClient";

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/admin">
    <Suspense><ReviewClient canEditRules={!user.manager} /></Suspense>
  </AppShell>;
}
