import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { sniffUpload } from "@/lib/upload-sniff";
import { riyadhToday } from "@/lib/visit-intel";
import { LEAVE_TYPES, LETTER_TYPES, OPEN, VISA_TYPES, addMonths, daysBetween, hrRequests, hrTitle, isDate, isHrKind, leaveBalances, payrollMonth } from "@/lib/hr";
import { addDays } from "@/lib/fmt";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Rep: own employee requests, leave balance and this month's deductions. Admin: everything to decide + payroll for ?month. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Unauthorized", 401);
  const today = riyadhToday(), year = Number(today.slice(0, 4)), month = today.slice(0, 7);
  if (user.role === "sales_rep") {
    const [requests, bal, pay] = await Promise.all([hrRequests({ userId: user.id }), leaveBalances([user.id], year), payrollMonth(month, user.id)]);
    return NextResponse.json({ today, requests, balance: bal[user.id] || null, payroll: pay[0] || null, month });
  }
  if (user.role !== "admin") return bad("Forbidden", 403);
  const sp = new URL(req.url).searchParams;
  const m = /^\d{4}-\d{2}$/.test(sp.get("month") || "") ? sp.get("month")! : month;
  const reps = (await query<{ id: string; name: string; hire_date: string | null; salary: number }>(
    "SELECT id, name, hire_date::text hire_date, COALESCE(salary,0)::float8 salary FROM users WHERE role='sales_rep' AND active ORDER BY name")).rows;
  const [requests, balances, payroll] = await Promise.all([hrRequests({ since: addDays(today, -120) }), leaveBalances(reps.map(r => r.id), year), payrollMonth(m)]);
  return NextResponse.json({ today, month: m, requests, balances, payroll, reps });
}

/** Rep creates an employee request (multipart form). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Unauthorized", 401);
  if (user.role !== "sales_rep") return bad("Forbidden", 403);
  const form = await req.formData().catch(() => null);
  if (!form) return bad("بيانات غير صالحة");
  const s = (k: string) => String(form.get(k) || "").trim();
  const kind = s("kind"), today = riyadhToday();
  if (!isHrKind(kind)) return bad("نوع الطلب غير معروف");
  const body = s("body").slice(0, 3000);
  let hrType = s("hr_type"), start: string | null = s("start_date") || null, end: string | null = s("end_date") || null;
  let days: number | null = null, amount: number | null = null, installments: number | null = null;
  const details: Record<string, unknown> = {};
  const file = form.get("file");
  let fileData: Buffer | null = null, fileMime: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) return bad("الحد الأقصى للمرفق 10 ميجابايت");
    fileData = Buffer.from(await file.arrayBuffer());
    const sn = sniffUpload(fileData);
    if (!sn || !["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"].includes(sn.mime)) return bad("المرفق لازم يكون PDF أو صورة");
    fileMime = sn.mime;
  }

  if (kind === "leave") {
    if (!(hrType in LEAVE_TYPES)) return bad("اختار نوع الإجازة");
    if (!isDate(start) || !isDate(end) || end < start) return bad("حدد تاريخ البداية والنهاية صح");
    if (start < addDays(today, hrType === "sick" ? -30 : -7)) return bad(hrType === "sick" ? "الإجازة المرضية تتقدم خلال 30 يوم من بدايتها" : "تاريخ البداية قديم — كلّم الإدارة مباشرة");
    days = daysBetween(start, end);
    if (days > 90) return bad("أقصى مدة في الطلب الواحد 90 يوم");
    if (hrType === "sick" && !fileData) return bad("الإجازة المرضية لازم يترفق معاها التقرير الطبي");
    const clash = await query("SELECT 1 FROM service_requests WHERE requester_id=$1 AND kind='leave' AND status = ANY($4::text[]) AND start_date <= $3::date AND end_date >= $2::date LIMIT 1",
      [user.id, start, end, ["approved", "completed", "closed", ...OPEN]]);
    if (clash.rowCount) return bad("عندك طلب إجازة تاني في نفس الأيام", 409);
    if (hrType === "annual") {
      const b = (await leaveBalances([user.id], Number(start.slice(0, 4))))[user.id];
      const free = b ? b.remaining - b.pending : 0;
      if (days > free) return bad(`رصيدك المتاح ${Math.max(0, free)} يوم بس${b?.pending ? ` (فيه ${b.pending} يوم في طلبات لسه مستنية)` : ""} — ممكن تاخد الباقي بدون راتب`);
    }
  } else if (kind === "exit_reentry") {
    if (!(hrType in VISA_TYPES)) return bad("اختار نوع التأشيرة");
    if (!isDate(start) || start < today) return bad("حدد تاريخ السفر");
    if (hrType === "single" && (!isDate(end) || end <= start)) return bad("حدد تاريخ العودة بعد تاريخ السفر");
    if (end && (!isDate(end) || end <= start)) return bad("تاريخ العودة لازم يكون بعد السفر");
    details.destination = s("destination").slice(0, 120);
    if (!details.destination) return bad("اكتب وجهة السفر");
    days = end ? daysBetween(start, end) : null;
  } else if (kind === "advance") {
    amount = Math.round(Number(s("amount").replace(/,/g, "")) * 100) / 100;
    installments = Math.round(Number(s("installments") || 1));
    const sm = s("start_month");
    if (!(amount > 0) || amount > 200000) return bad("اكتب مبلغ السلفة");
    if (!(installments >= 1 && installments <= 12)) return bad("عدد الأقساط من 1 لـ 12");
    if (!/^\d{4}-\d{2}$/.test(sm) || sm < today.slice(0, 7) || sm > addMonths(today.slice(0, 7), 6)) return bad("اختار شهر بداية الخصم (من الشهر ده لحد 6 شهور قدام)");
    if (body.length < 3) return bad("اكتب سبب السلفة");
    start = `${sm}-01`; end = null; hrType = "advance";
  } else {
    if (!(hrType in LETTER_TYPES)) return bad("اختار الجهة");
    details.addressee = s("addressee").slice(0, 160);
    if (!details.addressee) return bad("اكتب اسم الجهة الموجّه لها الخطاب");
    details.language = s("language") === "en" ? "en" : "ar";
    details.include_salary = s("include_salary") !== "no";
    start = null; end = null;
  }

  const title = hrTitle(kind, { hr_type: hrType, start_date: start, end_date: end, days, amount, installments, addressee: details.addressee as string | undefined });
  const priority = kind === "leave" && hrType === "sick" ? "high" : "normal";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: string }>(
      `INSERT INTO service_requests(requester_id, kind, title, body, priority, category, due_at, hr_type, start_date, end_date, days, amount, installments, hr_details,
         file_data, file_name, file_mime, last_action_at)
       VALUES($1,$2,$3,$4,$5,'hr', now() + interval '48 hours', $6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()) RETURNING id`,
      [user.id, kind, title, body, priority, hrType, start, end, days, amount, installments, JSON.stringify(details),
        fileData, fileData && file instanceof File ? file.name : null, fileMime]);
    const id = created.rows[0].id;
    await client.query("INSERT INTO service_request_events(request_id,actor_id,event_type,message,to_status) VALUES($1,$2,'created',$3,'pending')", [id, user.id, `قدّم ${user.name} ${title}`]);
    const admins = await client.query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active=true");
    for (const a of admins.rows) await client.query(
      "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_created',$2,$3,'service_request',$4)",
      [a.id, `${user.name}: ${title}`, `/admin/requests?hr=${id}`, id]);
    await client.query("COMMIT");
    return NextResponse.json({ id, title }, { status: 201 });
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

/** Admin: set a rep's annual entitlement override (null = by law) and carried-over days. */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return bad("Unauthorized", 401);
  if (user.role !== "admin") return bad("Forbidden", 403);
  const b = await req.json().catch(() => null) as { rep_id?: string; annual_leave_days?: number | null; leave_carryover?: number } | null;
  if (!b?.rep_id || !/^[0-9a-f-]{36}$/i.test(b.rep_id)) return bad("مندوب غير صالح");
  const ov = b.annual_leave_days === null || b.annual_leave_days === undefined || (b.annual_leave_days as unknown) === "" ? null : Math.round(Number(b.annual_leave_days));
  const carry = Math.round(Number(b.leave_carryover || 0));
  if (ov !== null && !(ov >= 0 && ov <= 60)) return bad("الرصيد السنوي من 0 لـ 60 يوم");
  if (!(carry >= -60 && carry <= 120)) return bad("الأيام المرحّلة من -60 لـ 120");
  const r = await query("UPDATE users SET annual_leave_days=$2, leave_carryover=$3 WHERE id=$1 AND role='sales_rep' RETURNING id", [b.rep_id, ov, carry]);
  if (!r.rowCount) return bad("المندوب غير موجود", 404);
  await query("INSERT INTO audit_logs(actor_id, action, entity, entity_id, details) VALUES($1,'leave_balance_set','user',$2,$3)", [user.id, b.rep_id, JSON.stringify({ annual_leave_days: ov, leave_carryover: carry })]).catch(() => null);
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
