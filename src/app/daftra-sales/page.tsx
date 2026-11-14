import { redirect } from "next/navigation";

/** Merged into /sales; old links keep working. */
export default async function DaftraSalesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab && /^[a-z]+$/.test(tab) ? `/sales?tab=${tab}` : "/sales");
}
