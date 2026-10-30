import type { Metadata } from "next";
import VerifyClient from "./VerifyClient";

export const metadata: Metadata = { title: "التحقق من مستند موقّع — Elite Skin", robots: { index: false } };
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const sp = await searchParams;
  return <VerifyClient initialRef={String(sp.ref || "").slice(0, 12)} />;
}
