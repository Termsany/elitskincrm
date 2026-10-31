import { query } from "@/lib/db";
import { enrichedVisits, summarize, todayBoard, riyadhToday, planAdherence } from "@/lib/visit-intel";
import { salesHub } from "@/lib/sales-hub";

const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
type Item = { id: string; title: string; owner: string | null; at: string; href: string };
type Group = { key: string; label: string; icon: string; href: string; count: number; items: Item[] };

/** Everything waiting for the manager, from every module, as one inbox. */
async function inbox(): Promise<Group[]> {
  const q = async (sql: string, vals: unknown[] = []) => (await query(sql, vals)).rows as Array<Record<string, any>>;
  const [plans, changes, signs, samples, doctorReqs, service, tasks, sales] = await Promise.all([
    q(`SELECT p.id::text id, 'خطة ' || CASE p.period::text WHEN 'weekly' THEN 'أسبوعية' WHEN 'monthly' THEN 'شهرية' ELSE 'يومية' END || ' · ' || to_char(p.period_start,'DD/MM') title, u.name owner, p.created_at at FROM plans p JOIN users u ON u.id=p.user_id WHERE p.status::text='pending' ORDER BY p.created_at`),
    q(`SELECT r.plan_id::text id, 'تعديل على خطة معتمدة' || CASE WHEN r.note<>'' THEN ' — ' || left(r.note,50) ELSE '' END title, u.name owner, r.created_at at FROM plan_edit_requests r JOIN users u ON u.id=r.requested_by WHERE r.status='pending' ORDER BY r.created_at`),
    q(`SELECT s.id::text id, CASE s.want WHEN 'stamp' THEN 'ختم' WHEN 'both' THEN 'توقيع وختم' ELSE 'توقيع' END || ' · ' || s.file_name title, u.name owner, s.created_at at FROM sign_requests s JOIN users u ON u.id=s.requested_by WHERE s.status='pending' ORDER BY s.created_at`),
    q(`SELECT vi.visit_id::text id, CASE vi.kind::text WHEN 'order' THEN 'طلب' ELSE 'عينة' END || ' ' || p.name || ' × ' || vi.quantity || ' · ' || d.name title, u.name owner, vi.created_at at FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN products p ON p.id=vi.product_id JOIN doctors d ON d.id=v.doctor_id JOIN users u ON u.id=v.sales_rep_id WHERE vi.approval_status='pending' ORDER BY vi.created_at`),
    q(`SELECT d.id::text id, CASE WHEN d.kind='create' THEN 'إضافة طبيب: ' ELSE 'تعديل طبيب: ' END || COALESCE(NULLIF(d.payload->>'name',''),'طلب') title, u.name owner, d.created_at at FROM doctor_requests d JOIN users u ON u.id=d.requester_id WHERE d.status='pending' ORDER BY d.created_at`),
    q(`SELECT r.id::text id, r.title, u.name owner, r.created_at at FROM service_requests r JOIN users u ON u.id=r.requester_id WHERE r.status IN ('pending','in_progress','needs_info','reopened') ORDER BY r.created_at`),
    q(`SELECT t.id::text id, t.title || ' · كانت ' || to_char(t.due_date,'DD/MM') title, NULL owner, t.created_at at FROM tasks t WHERE t.archived=false AND t.status::text IN ('pending','in_progress') AND t.due_date < $1::date ORDER BY t.due_date`, [riyadhToday()]),
    q(`SELECT 'f'||v.id::text id, 'توقع مبيعات' title, u.name owner, v.created_at at FROM forecast_versions v JOIN users u ON u.id=v.rep_id WHERE v.status IN ('pending','submitted')
       UNION ALL SELECT 's'||s.id::text, 'مبيعات للاعتماد', u.name, s.submitted_at FROM forecast_sales s JOIN users u ON u.id=s.rep_id WHERE s.status='pending'
       UNION ALL SELECT 't'||t.id::text, 'توزيع هدف', u.name, t.created_at FROM rep_target_versions t JOIN users u ON u.id=t.rep_id WHERE t.status='pending' ORDER BY 4`).catch(() => []),
  ]);
  const expenses = await q(`SELECT e.id::text id, c.name || ' · ' || to_char(e.amount, 'FM999,999,990.00') || ' ر.س' title, u.name owner, e.created_at at FROM expenses e JOIN users u ON u.id=e.rep_id JOIN expense_categories c ON c.id=e.category_id WHERE e.status='pending' ORDER BY e.created_at`).catch(() => []);
  const g = (key: string, label: string, icon: string, href: string, rows: Array<Record<string, any>>, link: (r: Record<string, any>) => string): Group =>
    ({ key, label, icon, href, count: rows.length, items: rows.slice(0, 5).map(r => ({ id: r.id, title: r.title, owner: r.owner, at: r.at, href: link(r) })) });
  return [
    g("plans", "خطط للاعتماد", "🗓️", "/plans?status=pending", plans, r => `/plans?planId=${r.id}`),
    g("changes", "تعديلات على خطط", "✎", "/plans?status=pending", changes, r => `/plans?planId=${r.id}`),
    g("signs", "طلبات توقيع", "🖋️", "/library?view=signreq", signs, () => "/library?view=signreq"),
    g("samples", "عينات وطلبات", "🧪", "/visits?tab=visits", samples, r => `/visits?visit=${r.id}`),
    g("expenses", "مصروفات للاعتماد", "💵", "/expenses?tab=review", expenses, () => "/expenses?tab=review"),
    g("sales", "مبيعات وتوقعات", "💰", "/sales?tab=workspace", sales as Array<Record<string, any>>, () => "/sales?tab=workspace"),
    g("doctors", "طلبات أطباء", "🩺", "/admin/requests", doctorReqs, () => "/admin/requests"),
    g("service", "طلبات خدمة", "📨", "/admin/requests", service, r => `/admin/requests?request=${r.id}`),
    g("tasks", "مهام متأخرة", "⏰", "/tasks", tasks, () => "/tasks"),
  ].filter(x => x.count > 0);
}

export async function adminDashboard(userName: string) {
  const today = riyadhToday();
  const from14 = addDays(today, -13), weekStart = addDays(today, -6), prevStart = addDays(today, -13), prevEnd = addDays(today, -7);
  const year = Number(today.slice(0, 4)), month = today.slice(0, 7);
  const [box, board, visits14, sales, coverage, activity, adhWeek, overdue, aGap] = await Promise.all([
    inbox(),
    todayBoard(),
    enrichedVisits({ from: from14, to: today }),
    salesHub({ id: "", role: "admin" }, year, null).catch(() => null),
    query(`SELECT COALESCE(d.classification,'—') cls, count(*)::int total,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.status::text<>'cancelled' AND v.visited_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')))::int visited
      FROM doctors d WHERE d.status='active' GROUP BY 1 ORDER BY 1`),
    query(`SELECT * FROM (
        SELECT 'visit' kind, v.visited_at at, u.name who, 'زار ' || d.name || COALESCE(' · ' || NULLIF(d.clinic_name,''),'') what, '/visits?visit=' || v.id href FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id WHERE v.status::text<>'cancelled'
        UNION ALL SELECT 'plan', p.created_at, u.name, CASE WHEN p.status::text='pending' THEN 'بعت خطة للاعتماد' ELSE 'خطة ' || p.status::text END, '/plans?planId=' || p.id FROM plans p JOIN users u ON u.id=p.user_id
        UNION ALL SELECT CASE WHEN l.signed THEN 'sign' ELSE 'file' END, l.created_at, u.name, CASE WHEN l.signed THEN 'وقّع ' ELSE 'رفع ' END || l.name, '/library?file=' || l.id FROM library_files l JOIN users u ON u.id=l.owner_id WHERE l.deleted_at IS NULL AND COALESCE(l.source_kind,'')<>'visit_report'
        UNION ALL SELECT 'signreq', s.created_at, u.name, 'طلب توقيع على ' || s.file_name, '/library?view=signreq' FROM sign_requests s JOIN users u ON u.id=s.requested_by
      ) x ORDER BY at DESC LIMIT 12`),
    planAdherence(weekStart, today),
    query(`SELECT count(*)::int n FROM visits v WHERE v.follow_up_at IS NOT NULL AND v.follow_up_at < $1::date AND v.status::text<>'cancelled'
        AND NOT EXISTS(SELECT 1 FROM visits v2 WHERE v2.doctor_id=v.doctor_id AND v2.visited_at > v.visited_at AND v2.status::text<>'cancelled')`, [today]),
    query(`SELECT count(*)::int n FROM doctors d WHERE d.status='active' AND upper(d.classification)='A'
        AND NOT EXISTS(SELECT 1 FROM visits v WHERE v.doctor_id=d.id AND v.status::text<>'cancelled' AND v.visited_at > now() - interval '30 days')`),
  ]);
  const thisWeek = summarize(visits14.filter(v => v.day >= weekStart));
  const lastWeek = summarize(visits14.filter(v => v.day >= prevStart && v.day <= prevEnd));
  const daily = Array.from({ length: 14 }, (_, i) => { const d = addDays(from14, i); const s = summarize(visits14.filter(v => v.day === d)); return { day: d, visits: s.kpi.visits, quality: s.kpi.visits ? s.kpi.avgQuality : null, red: s.kpi.redFlags }; });
  const m = sales?.monthly?.find((x: { month: string }) => x.month === month) as { target?: number; actual?: number; forecast?: number } | undefined;
  const dayOfMonth = Number(today.slice(8, 10)), daysInMonth = new Date(year, Number(month.slice(5, 7)), 0).getDate();
  const salesPulse = { target: Number(m?.target || 0), actual: Number(m?.actual || 0), forecast: Number(m?.forecast || 0), pace: Math.round(dayOfMonth / daysInMonth * 100), annual: Number(sales?.annual || 0), ytd: Number((sales?.monthly || []).filter((x: { month: string }) => x.month <= month).reduce((a: number, x: { actual?: number }) => a + Number(x.actual || 0), 0)) };
  const weekPlanned = adhWeek.reduce((a, x) => a + x.planned, 0), weekDone = adhWeek.reduce((a, x) => a + x.done, 0);

  // Smart insights — only things worth a manager's attention, most important first.
  const insights: Array<{ tone: "red" | "amber" | "green" | "blue"; icon: string; title: string; text: string; href: string }> = [];
  for (const r of thisWeek.reps.filter(r => r.redFlags >= 3).slice(0, 2))
    insights.push({ tone: "red", icon: "🚩", title: `${r.rep_name}: ${r.redFlags} زيارة محتاجة مراجعة`, text: "اتسجلت بشكل جماعي من نفس المكان أو بعيد عن العيادة الأسبوع ده", href: `/visits?tab=visits&repId=${r.rep_id}` });
  if (weekPlanned >= 5 && weekDone / weekPlanned < 0.6) insights.push({ tone: "amber", icon: "🗓️", title: `الالتزام بالخطط ${Math.round(weekDone / weekPlanned * 100)}% بس`, text: `${weekDone} زيارة من ${weekPlanned} مخططة اتنفذت آخر 7 أيام`, href: "/plans" });
  if (salesPulse.target > 0 && salesPulse.actual / salesPulse.target * 100 < salesPulse.pace - 15) insights.push({ tone: "amber", icon: "💰", title: `مبيعات الشهر ${Math.round(salesPulse.actual / salesPulse.target * 100)}% والشهر عدّى ${salesPulse.pace}%`, text: "محتاجين نسرّع عشان نوصل للهدف", href: "/sales" });
  if (aGap.rows[0]?.n) insights.push({ tone: "amber", icon: "🩺", title: `${aGap.rows[0].n} طبيب تصنيف A ما اتزارش من 30 يوم`, text: "دول أهم أطبائك — يستاهلوا يدخلوا خطة الأسبوع الجاي", href: "/doctors?tab=insights" });
  if (overdue.rows[0]?.n) insights.push({ tone: "blue", icon: "🔁", title: `${overdue.rows[0].n} متابعة فات معادها`, text: "مواعيد متابعة اتحددت في زيارات ومحدش رجع للطبيب", href: "/visits?tab=visits" });
  const best = thisWeek.reps.find(r => r.visits >= 3 && r.redFlags === 0);
  if (best) insights.push({ tone: "green", icon: "🏆", title: `${best.rep_name} الأعلى جودة الأسبوع ده`, text: `${best.visits} زيارة بمتوسط جودة ${best.avgQuality}/100 — ممكن تبعتله كلمة تشجيع`, href: `/visits?tab=visits&repId=${best.rep_id}` });

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء النور" : "مساء الخير";
  const pendingTotal = box.reduce((a, g) => a + g.count, 0);
  const active = board.board.filter(b => b.state === "active").length;
  const summary = [
    board.summary.visits ? `${board.summary.visits} زيارة النهارده` : "لسه مفيش زيارات النهارده",
    active ? `${active} مندوب شغال دلوقتي` : null,
    pendingTotal ? `${pendingTotal} حاجة مستنية قرارك` : "مفيش حاجة مستنياك ✓",
  ].filter(Boolean).join(" · ");
  return {
    greeting, name: userName.split(" ")[0], today, summary,
    inbox: box, pendingTotal,
    pulse: {
      today: { visits: board.summary.visits, planned: board.planned, done: board.done, active, reps: board.board.length, red: board.summary.redFlags },
      quality: { week: thisWeek.kpi.avgQuality, lastWeek: lastWeek.kpi.avgQuality, visits: thisWeek.kpi.visits, bands: thisWeek.bands },
      sales: salesPulse,
      coverage: (coverage.rows as Array<{ cls: string; total: number; visited: number }>).filter(c => ["A", "B", "C"].includes(String(c.cls).toUpperCase())),
    },
    team: board.board.map(b => ({ rep_id: b.rep_id, rep_name: b.rep_name, state: b.state, visits: b.visits, planned: b.planned, done: b.done, avgQuality: b.avgQuality, sinceMin: b.sinceMin, redFlags: b.redFlags })),
    daily, insights: insights.slice(0, 5),
    activity: activity.rows,
  };
}

/** Global search for the command palette. */
export async function globalSearch(q: string) {
  const like = `%${q.trim()}%`;
  if (q.trim().length < 2) return [];
  const [docs, reps, prods, files] = await Promise.all([
    query(`SELECT id::text id, name, COALESCE(clinic_name,'') || COALESCE(' · ' || NULLIF(city,''),'') sub, classification FROM doctors WHERE status='active' AND (name ILIKE $1 OR clinic_name ILIKE $1 OR phone ILIKE $1) ORDER BY name LIMIT 6`, [like]),
    query(`SELECT id::text id, name, COALESCE(email,'') sub FROM users WHERE role='sales_rep' AND active AND (name ILIKE $1 OR email ILIKE $1) ORDER BY name LIMIT 4`, [like]),
    query(`SELECT id::text id, name, COALESCE(category,'') sub FROM products WHERE name ILIKE $1 ORDER BY name LIMIT 4`, [like]),
    query(`SELECT id::text id, name, folder sub FROM library_files WHERE deleted_at IS NULL AND name ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [like]),
  ]);
  return [
    ...docs.rows.map(r => ({ kind: "doctor", icon: "🩺", title: r.name, sub: `${r.classification ? `${r.classification} · ` : ""}${r.sub}`, href: `/doctors?q=${encodeURIComponent(r.name)}` })),
    ...reps.rows.map(r => ({ kind: "rep", icon: "👤", title: r.name, sub: "زياراته · خططه", href: `/visits?tab=visits&repId=${r.id}` })),
    ...prods.rows.map(r => ({ kind: "product", icon: "💊", title: r.name, sub: r.sub || "منتج", href: "/admin/products" })),
    ...files.rows.map(r => ({ kind: "file", icon: "📄", title: r.name, sub: `المكتبة · ${r.sub}`, href: `/library?file=${r.id}` })),
  ];
}
