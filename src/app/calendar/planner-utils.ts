export type Kind = "plan" | "visit" | "event" | "followup" | "task";
export type PlanRow = { id: string; date: string; priority: string; note: string; plan_id: string; plan_status: string; period: string; period_start: string; period_end: string; rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; classification: string | null; phone: string | null; product_id: string | null; product_name: string | null; visit_id: string | null; change_pending: boolean };
export type VisitRow = { id: string; date: string; visited_at: string; status: string; rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string | null; city: string | null; classification: string | null };
export type EventRow = { id: string; title: string; description: string; event_type: string; status: string; starts_at: string; ends_at: string; rep_id: string; rep_name: string; doctor_id: string | null; doctor_name: string | null; task_id: string | null; visit_id: string | null; service_request_id: string | null; collaboration_request_id: string | null; date: string };
export type FollowRow = { id: string; date: string; note: string; rep_id: string; rep_name: string; doctor_id: string; doctor_name: string; clinic_name: string | null; done: boolean };
export type TaskRow = { id: string; title: string; date: string; status: string; priority: string; doctor_id: string | null };
export type Agenda = { from: string; to: string; today: string; plan: PlanRow[]; visits: VisitRow[]; events: EventRow[]; followups: FollowRow[]; tasks: TaskRow[] };
export type Item =
  | { kind: "plan"; key: string; date: string; rep_id: string; state: "done" | "missed" | "planned" | "today"; row: PlanRow }
  | { kind: "visit"; key: string; date: string; rep_id: string; row: VisitRow }
  | { kind: "event"; key: string; date: string; rep_id: string; row: EventRow }
  | { kind: "followup"; key: string; date: string; rep_id: string; row: FollowRow }
  | { kind: "task"; key: string; date: string; rep_id: string; row: TaskRow };

export const addDays = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
export const weekStart = (d: string) => addDays(d, -dow(d));
export const monthGridStart = (d: string) => weekStart(`${d.slice(0, 7)}-01`);
export const todayRiyadh = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const L = "ar-EG-u-nu-latn";
export const fmtDay = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) => new Intl.DateTimeFormat(L, { ...o, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
export const fmtTime = (t: string) => new Intl.DateTimeFormat(L, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(t));
export const WEEK = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

export function buildItems(a: Agenda, layers: Record<Kind, boolean>): Item[] {
  const out: Item[] = [];
  const planVisitIds = new Set(a.plan.map(p => p.visit_id).filter(Boolean));
  if (layers.plan) for (const r of a.plan) out.push({ kind: "plan", key: `p:${r.id}`, date: r.date, rep_id: r.rep_id, state: r.visit_id ? "done" : r.date < a.today ? "missed" : r.date === a.today ? "today" : "planned", row: r });
  if (layers.visit) for (const r of a.visits) if (!planVisitIds.has(r.id)) out.push({ kind: "visit", key: `v:${r.id}`, date: r.date, rep_id: r.rep_id, row: r });
  if (layers.event) for (const r of a.events) out.push({ kind: "event", key: `e:${r.id}`, date: r.date, rep_id: r.rep_id, row: r });
  if (layers.followup) for (const r of a.followups) if (!r.done) out.push({ kind: "followup", key: `f:${r.id}`, date: r.date, rep_id: r.rep_id, row: r });
  if (layers.task) for (const r of a.tasks) out.push({ kind: "task", key: `t:${r.id}`, date: r.date, rep_id: "", row: r });
  const rank = (i: Item) => i.kind === "event" ? 0 : i.kind === "plan" ? 1 : i.kind === "followup" ? 2 : i.kind === "visit" ? 3 : 4;
  return out.sort((x, y) => x.date.localeCompare(y.date) || rank(x) - rank(y) || (x.kind === "event" && y.kind === "event" ? x.row.starts_at.localeCompare(y.row.starts_at) : 0));
}

export const KIND_META: Record<Kind, { label: string; dot: string; chip: string; icon: string }> = {
  plan: { label: "زيارات الخطة", dot: "bg-[var(--navy)]", chip: "border-[var(--navy)]/20 bg-[var(--sky-light)]", icon: "🩺" },
  visit: { label: "زيارات خارج الخطة", dot: "bg-slate-500", chip: "border-slate-200 bg-slate-50", icon: "✔" },
  event: { label: "المواعيد", dot: "bg-violet-600", chip: "border-violet-200 bg-violet-50", icon: "🕑" },
  followup: { label: "المتابعات", dot: "bg-amber-500", chip: "border-amber-200 bg-amber-50", icon: "↻" },
  task: { label: "المهام", dot: "bg-sky-600", chip: "border-sky-200 bg-sky-50", icon: "☑" },
};
export const PLAN_STATE: Record<string, { label: string; cls: string }> = {
  done: { label: "تمت", cls: "bg-emerald-600 text-white" },
  missed: { label: "فاتت", cls: "bg-red-600 text-white" },
  today: { label: "النهارده", cls: "bg-amber-500 text-white" },
  planned: { label: "مخططة", cls: "bg-white text-[var(--navy)] border border-[var(--navy)]/20" },
};
export const PLAN_STATUS_LABEL: Record<string, string> = { approved: "معتمدة", pending: "بانتظار الموافقة", needs_revision: "مطلوب تعديل", draft: "مسودة", rejected: "مرفوضة" };
