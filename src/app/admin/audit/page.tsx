import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
export default async function AuditPage(){const user=await getCurrentUser();if(!user)redirect("/login");if(user.role!=="admin")redirect("/");redirect("/admin/reps");}
