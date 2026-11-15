import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The accounts moved to the finance app; old links and bell notifications open it there. */
export default function AccountsMoved() {
  redirect(process.env.FINANCE_APP_URL || "https://finance.eliteskinsa.com");
}
