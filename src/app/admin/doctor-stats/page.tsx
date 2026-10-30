import { redirect } from "next/navigation";
// Doctor performance now lives inside the doctors hub.
export default function DoctorStatsPage() { redirect("/doctors?tab=insights"); }
