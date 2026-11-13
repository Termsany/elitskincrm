import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import LibraryClient from "./LibraryClient";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ file?: string; view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  return (
    <AppShell role={user.role} email={user.email} name={user.name} jobTitle={user.job_title} productName={user.product_name} active="/library">
      <h1 className="text-2xl font-extrabold text-[var(--navy)]">مكتبة المستندات</h1>
      <LibraryClient isAdmin={user.role === "admin"} userId={user.id} initialFile={/^[0-9a-f-]{36}$/i.test(sp.file || "") ? sp.file : undefined} initialView={sp.view === "signreq" ? "signreq" : undefined} />
    </AppShell>
  );
}
