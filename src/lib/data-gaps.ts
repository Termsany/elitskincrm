import { query } from "@/lib/db";
import { clinicsOfClientSql } from "@/lib/clinic-groups";

/** Missing setup data the admin should fill (each item links to where it is fixed). Salary lines are hidden from the sales manager. */
export type Gap = { key: string; tone: "red" | "amber" | "blue"; title: string; text: string; href: string; names?: string[]; deactivate?: Array<{ id: string; name: string; email: string }> };

export async function dataGaps(meId: string, year: number, opts: { manager?: boolean } = {}): Promise<Gap[]> {
  const q = async <T extends Record<string, unknown>>(sql: string, v: unknown[] = []) => (await query<T>(sql, v)).rows;
  const [reps, unlinked, docs, idle, noBranch] = await Promise.all([
    q<{ id: string; name: string; salary: number; hire_date: string | null; target: number | null; has_product: boolean }>(`SELECT u.id, u.name, COALESCE(u.salary,0)::float8 salary, u.hire_date::text hire_date,
        (SELECT annual_amount::float8 FROM rep_target_years t WHERE t.rep_id=u.id AND t.year=$1) target,
        (u.assigned_product_id IS NOT NULL OR EXISTS (SELECT 1 FROM rep_products rp WHERE rp.rep_id=u.id)) has_product
      FROM users u WHERE u.role='sales_rep' AND u.active ORDER BY u.name`, [year]),
    q<{ n: number; value: number }>(`SELECT count(DISTINCT i.client_id)::int n, COALESCE(sum(i.total),0)::float8 value FROM daftra_invoices i
      WHERE NOT EXISTS (SELECT 1 FROM daftra_client_links l WHERE l.client_id=i.client_id AND l.clinic_id IS NOT NULL)`).catch(() => [{ n: 0, value: 0 }]),
    q<{ nocls: number; noclinic: number }>(`SELECT count(*) FILTER (WHERE COALESCE(classification,'')='')::int nocls, count(*) FILTER (WHERE clinic_id IS NULL)::int noclinic
      FROM doctors WHERE COALESCE(status,'active')='active'`),
    q<{ id: string; name: string; email: string; role: string }>(`SELECT id, name, email, role FROM users WHERE active AND last_login_at IS NULL AND created_at < now() - interval '3 days' AND id <> $1 ORDER BY role, name`, [meId]),
    q<{ n: number; names: string[] }>(`SELECT count(*)::int n, (array_agg(name ORDER BY name))[1:6] names FROM (SELECT i.client_id, max(i.client_name) name FROM daftra_invoices i GROUP BY i.client_id) k
      WHERE NOT EXISTS (SELECT 1 FROM doctors d WHERE d.clinic_id IN ${clinicsOfClientSql("k.client_id")})`).catch(() => [{ n: 0, names: [] }]),
  ]);
  const out: Gap[] = [];
  const names = (f: (r: (typeof reps)[number]) => boolean) => reps.filter(f).map(r => r.name);
  const firstId = (f: (r: (typeof reps)[number]) => boolean) => reps.find(f)?.id;
  const noTarget = (r: (typeof reps)[number]) => !r.target;
  if (reps.some(noTarget)) out.push({ key: "targets", tone: "red", title: `${names(noTarget).length} مندوب من غير هدف ${year}`, text: "من غير هدف مفيش نسبة تحقيق ولا مقارنة في التقارير", href: "/sales?tab=targets", names: names(noTarget) });
  const noProduct = (r: (typeof reps)[number]) => !r.has_product;
  if (reps.some(noProduct)) out.push({ key: "product", tone: "red", title: `${names(noProduct).length} مندوب مش مربوط بمنتج`, text: "مبيعات دفترة بتتحسب للمندوب عن طريق المنتج", href: "/sales?tab=items", names: names(noProduct) });
  if (!opts.manager) {
    const noSalary = (r: (typeof reps)[number]) => !(r.salary > 0);
    if (reps.some(noSalary)) out.push({ key: "salary", tone: "amber", title: `${names(noSalary).length} مندوب من غير راتب`, text: "خصم الإجازة بدون راتب والسلف بيطلع صفر", href: `/admin/rep/${firstId(noSalary)}`, names: names(noSalary) });
  }
  const noHire = (r: (typeof reps)[number]) => !r.hire_date;
  if (reps.some(noHire)) out.push({ key: "hire", tone: "amber", title: `${names(noHire).length} مندوب من غير تاريخ تعيين`, text: "رصيد الإجازة بيتحسب 21 يوم افتراضي لحد ما يتسجل", href: `/admin/rep/${firstId(noHire)}`, names: names(noHire) });
  if (!opts.manager && unlinked[0]?.n) out.push({ key: "daftra", tone: "amber", title: `${unlinked[0].n} عميل في دفترة مش مربوط بعيادة`, text: "حساب العيادة وتنبيه «بتقل» مش هيشتغلوا عليه", href: "/daftra-sales?tab=ar" });
  if (!opts.manager && noBranch[0]?.n) out.push({ key: "branches", tone: "amber", title: `${noBranch[0].n} عميل في دفترة من غير فروع فيها أطباء`, text: "اربط فروع كل عميل (زي HOSN yarmouk و HOSN Dahran) عشان حسابه يظهر عند أطباء الفروع", href: "/daftra-sales?tab=ar#branches", names: noBranch[0].names?.slice(0, 4) });
  if (docs[0]?.nocls) out.push({ key: "class", tone: "blue", title: `${docs[0].nocls} طبيب من غير فئة`, text: "الفئة بتحدد كل قد إيه لازم يتزار", href: "/doctors" });
  if (docs[0]?.noclinic) out.push({ key: "clinic", tone: "blue", title: `${docs[0].noclinic} طبيب مش مربوط بعيادة`, text: "ربطه بالعيادة بيظهر حسابها من دفترة في صفحته", href: "/doctors" });
  const idleReps = idle.filter(u => u.role === "sales_rep"), idleAdmins = idle.filter(u => u.role === "admin");
  if (idleReps.length) out.push({ key: "idle-reps", tone: "red", title: `${idleReps.length} مندوب عمره ما دخل البرنامج`, text: "ابعتله الإيميل وكلمة المرور من «المناديب» ← تعديل الحساب", href: "/admin/reps", names: idleReps.map(u => u.name) });
  if (!opts.manager && idleAdmins.length) out.push({ key: "idle-admins", tone: "blue", title: `${idleAdmins.length} حساب أدمن مش مستخدم`, text: "حسابات بصلاحيات كاملة ومحدش بيدخل بيها — الأمان إنك تقفلها", href: "/admin/reps", deactivate: idleAdmins.map(u => ({ id: u.id, name: u.name, email: u.email })) });
  return out;
}
