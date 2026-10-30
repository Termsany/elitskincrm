import { redirect } from "next/navigation";
/** The full visits log now lives in the unified visits page. */
export default function VisitsLogRedirect() { redirect("/visits?tab=visits"); }
