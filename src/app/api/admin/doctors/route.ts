import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { doctorSchema } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await query("SELECT * FROM doctors ORDER BY name LIMIT 500");
  return NextResponse.json({ doctors: r.rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(()=>null);
  const parsed = doctorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  try {
    const r = await query(
      "INSERT INTO doctors(name, clinic_name, city, specialty, classification, phone, email, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [d.name, d.clinic_name||"", d.city||"", d.specialty||"", d.classification||"", d.phone||"", d.email||"", d.status||"active"]
    );
    await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id) VALUES($1,'create','doctor',$2)", [user.id, r.rows[0].id]);
    return NextResponse.json({ id: r.rows[0].id }, { status: 201 });
  } catch(e:unknown){
    const msg=e instanceof Error? e.message: String(e);
    if(msg.includes("duplicate")||msg.includes("unique")) return NextResponse.json({error:"الطبيب موجود بنفس الاسم والعيادة والهاتف"},{status:409});
    throw e;
  }
}
