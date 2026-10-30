"use client";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { distributeSuggestionsByArea, findFiveDayDuplicate, shiftPlanItems } from "@/lib/plan-workflow";
import { PLAN_PERIODS, planPeriodLabel, type PlanPeriod } from "@/lib/plan-periods";
import { canAdminReviewPlan } from "@/lib/plan-review";
import { isPlanWorkspacePayload, planTargetProgress, representativeCanReceivePlan } from "@/lib/plan-workspace";
import { diffPlanItems, diffSummaryText, type PlanDiff, type PlanItemLike } from "@/lib/plan-diff";

type Plan = { id: string; user_id: string; user_name: string; period: string; period_start: string; period_end: string; status: string; admin_note: string; items_count: number; created_at: string; target_visits: number | null; rating: number | null; template_name: string; pending_changes?: number };
type PlanSummary = { total: number; pending: number; approved: number; needs_revision: number; rejected: number; planned_visits: number; change_requests?: number };
type RepPlanSummary = { id: string; name: string; active: boolean; total: number; pending: number; approved: number; planned_visits: number };
type Doctor = { id: string; name: string; clinic_name: string; city: string; classification?: string };
type Product = { id: string; name: string };
type Rep = { id: string; name: string; active: boolean };
type SavedTemplate = { id: string; name: string; period_start: string; period_end: string; target_visits: number | null };
type DayItem = { doctor_id: string; product_id: string; note: string; priority: string };
type FlatItem = DayItem & { planned_date: string };
type Counts = { added: number; removed: number; moved: number; changed: number; total: number };
type ChangeReq = { id: string; note: string; created_at: string; requested_by_name: string; proposed: PlanItemLike[]; diff: PlanDiff<PlanItemLike>; counts: Counts };
type Hist = { id: string; status: string; note: string; admin_note: string; created_at: string; reviewed_at: string | null; requested_by_name: string; reviewed_by_name: string | null; summary: string };
type Detail = { plan: Plan & Record<string, unknown>; items: Array<Record<string, any>>; revisions: Array<{ id: string; user_name: string; note: string; created_at: string }>; comments: Array<{ id: string; body: string; user_name: string; created_at: string }>; change_request: ChangeReq | null; change_history: Hist[] };
type QueueReq = { id: string; plan_id: string; note: string; proposed_items: Array<Record<string, any>>; created_at: string; requested_by_name: string; ps: string; pe: string };
type EditMode = null | "admin" | "rep-direct" | "rep-request";
type Tab = "overview" | "review" | "builder" | "plans" | "execution";

const L = "ar-EG-u-nu-latn";
const d10 = (v: unknown) => String(v ?? "").slice(0, 10);
const fd = (d: unknown, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => { const s = d10(d); return s ? new Date(s + "T12:00:00").toLocaleDateString(L, o) : "—"; };
const fdt = (d: unknown) => new Date(String(d)).toLocaleString(L, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { label: "مسودة", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  pending: { label: "بانتظار الاعتماد", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  approved: { label: "معتمدة", cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  rejected: { label: "مرفوضة", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  needs_revision: { label: "تحتاج تعديل", cls: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
};
const HIST: Record<string, string> = { approved: "اتوافق عليه", rejected: "اترفض", cancelled: "اتسحب" };
const PRIO: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const SA_HOLIDAYS: Record<string, string> = {
  "2026-02-22": "يوم التأسيس", "2026-02-23": "يوم التأسيس",
  "2026-03-19": "عيد الفطر", "2026-03-20": "عيد الفطر", "2026-03-21": "عيد الفطر", "2026-03-22": "عيد الفطر",
  "2026-05-26": "عيد الأضحى", "2026-05-27": "عيد الأضحى", "2026-05-28": "عيد الأضحى", "2026-05-29": "عيد الأضحى",
  "2026-09-23": "اليوم الوطني", "2026-11-15": "إجازة إضافية",
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const isHoliday = (date: string) => SA_HOLIDAYS[date] || null;
const isWeekend = (date: string) => { const w = new Date(date + "T12:00:00").getDay(); return w === 5 || w === 6; };
type DayCell = { date: string; label: string; weekday: string; holiday: string | null; weekend: boolean };
function periodDays(startStr: string, period: PlanPeriod): DayCell[] {
  if (!startStr) return [];
  const count = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const s = new Date(startStr + "T12:00:00");
  return Array.from({ length: count }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); const date = iso(d); return { date, label: d.toLocaleDateString(L, { day: "numeric", month: "short" }), weekday: DAY_NAMES[d.getDay()], holiday: isHoliday(date), weekend: isWeekend(date) }; });
}
const workDays = (start: string, period: PlanPeriod) => periodDays(start, period).filter(d => !d.weekend && !d.holiday);
function groupDays(rows: Array<Record<string, any>>) {
  const next: Record<string, DayItem[]> = {};
  for (const row of rows) { const date = d10(row.planned_date); (next[date] ||= []).push({ doctor_id: String(row.doctor_id || ""), product_id: String(row.product_id || ""), note: String(row.note || ""), priority: String(row.priority || "medium") }); }
  return next;
}
function useDevice() {
  const [w, setW] = useState(1400);
  useEffect(() => { const f = () => setW(window.innerWidth); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return w < 768 ? "phone" : w < 1200 ? "tablet" : "desktop";
}
const Pill = ({ status, small }: { status: string; small?: boolean }) => { const m = STATUS[status] || STATUS.draft; return <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>; };
const classTone = (c?: string) => c === "A" ? "bg-emerald-100 text-emerald-800" : c === "B" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition disabled:opacity-50";
const btnPrimary = `${btn} bg-[var(--navy)] text-white hover:opacity-95`;
const btnGhost = `${btn} border border-[var(--border)] bg-white text-[var(--ink)] hover:bg-[var(--bg)]`;
const field = "h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--sky)] disabled:bg-[var(--bg)] disabled:text-[var(--muted)]";
const card = "rounded-3xl border border-[var(--border)] bg-white";

function CountChips({ c, size = "sm" }: { c: { added: number; removed: number; moved: number; changed: number }; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return <span className="inline-flex flex-wrap gap-1">
    {c.added > 0 && <span className={`rounded-full bg-emerald-100 font-bold text-emerald-800 ${cls}`}>+{c.added} إضافة</span>}
    {c.removed > 0 && <span className={`rounded-full bg-red-100 font-bold text-red-700 ${cls}`}>−{c.removed} حذف</span>}
    {c.moved > 0 && <span className={`rounded-full bg-sky-100 font-bold text-sky-800 ${cls}`}>⇄ {c.moved} نقل</span>}
    {c.changed > 0 && <span className={`rounded-full bg-amber-100 font-bold text-amber-800 ${cls}`}>✎ {c.changed} تعديل</span>}
  </span>;
}

function DiffList({ diff, name }: { diff: PlanDiff<PlanItemLike>; name: (x: PlanItemLike) => string }) {
  const FIELD: Record<string, string> = { product: "المنتج", priority: "الأولوية", note: "الملاحظة", date: "اليوم" };
  const rows: Array<{ k: string; tone: string; icon: string; title: string; sub: string }> = [
    ...diff.added.map((x, i) => ({ k: `a${i}`, tone: "border-emerald-200 bg-emerald-50", icon: "+", title: name(x), sub: `زيارة جديدة يوم ${fd(x.planned_date, { weekday: "long", day: "numeric", month: "short" })}${x.product_name ? ` · ${x.product_name}` : ""}` })),
    ...diff.moved.map((p, i) => ({ k: `m${i}`, tone: "border-sky-200 bg-sky-50", icon: "⇄", title: name(p.to), sub: `${fd(p.from.planned_date, { weekday: "short", day: "numeric", month: "short" })} ← ${fd(p.to.planned_date, { weekday: "short", day: "numeric", month: "short" })}`.replace("←", "→") })),
    ...diff.changed.map((p, i) => ({ k: `c${i}`, tone: "border-amber-200 bg-amber-50", icon: "✎", title: name(p.to), sub: `${fd(p.to.planned_date, { weekday: "short", day: "numeric" })} · اتغير: ${p.fields.map(f => FIELD[f]).join("، ")}${p.fields.includes("product") ? ` (${p.from.product_name || "بدون"} → ${p.to.product_name || "بدون"})` : ""}${p.fields.includes("priority") ? ` (${PRIO[String(p.from.priority || "medium")]} → ${PRIO[String(p.to.priority || "medium")]})` : ""}` })),
    ...diff.removed.map((x, i) => ({ k: `r${i}`, tone: "border-red-200 bg-red-50", icon: "−", title: name(x), sub: `اتشالت من يوم ${fd(x.planned_date, { weekday: "long", day: "numeric", month: "short" })}` })),
  ];
  if (!rows.length) return <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-[var(--muted)]">مفيش تغييرات</div>;
  return <div className="space-y-1.5">{rows.map(r => <div key={r.k} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${r.tone}`}>
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold shadow-sm">{r.icon}</span>
    <div className="min-w-0"><div className={`truncate text-sm font-bold ${r.icon === "−" ? "line-through decoration-red-400" : ""}`}>{r.title}</div><div className="text-[11px] text-[var(--muted)]">{r.sub}</div></div>
  </div>)}</div>;
}

export default function PlansClient({ isAdmin, reps, doctors, products, initialStatus = "", initialPeriod = "", initialPlanId = "", initialRepId = "" }: { isAdmin: boolean; reps: Rep[]; doctors: Doctor[]; products: Product[]; currentUserId: string; initialStatus?: string; initialPeriod?: string; initialPlanId?: string; initialRepId?: string }) {
  const toast = useToast();
  const device = useDevice();
  const today = riyadhToday();
  const doctorMap = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors]);
  const docName = (id: string) => doctorMap.get(id)?.name || "طبيب";
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);

  const [tab, setTab] = useState<Tab>(isAdmin && initialStatus === "pending" ? "review" : "overview");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reviewPlans, setReviewPlans] = useState<Plan[]>([]);
  const [queue, setQueue] = useState<QueueReq[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<PlanSummary>({ total: 0, pending: 0, approved: 0, needs_revision: 0, rejected: 0, planned_visits: 0 });
  const [repSummary, setRepSummary] = useState<RepPlanSummary[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [planSearch, setPlanSearch] = useState("");
  const [filter, setFilter] = useState(initialStatus === "pending" && isAdmin ? "" : initialStatus);
  const [periodFilter, setPeriodFilter] = useState(initialPeriod);
  const [viewRepId, setViewRepId] = useState(initialRepId || "");
  const [adminPlanRepId, setAdminPlanRepId] = useState(initialRepId || reps.find(r => representativeCanReceivePlan(r.active))?.id || "");

  // builder
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [originalItems, setOriginalItems] = useState<FlatItem[]>([]);
  const [changeNote, setChangeNote] = useState("");
  const [planPeriod, setPlanPeriod] = useState<PlanPeriod>("weekly");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [targetVisits, setTargetVisits] = useState(10);
  const [templateName, setTemplateName] = useState("");
  const [templateCopyStart, setTemplateCopyStart] = useState("");
  const [itemsByDay, setItemsByDay] = useState<Record<string, DayItem[]>>({});
  const [saving, setSaving] = useState(false);
  const items = useMemo(() => Object.entries(itemsByDay).sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, list]) => list.map(it => ({ ...it, planned_date: date }))), [itemsByDay]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [pickerQ, setPickerQ] = useState(""); const [pickerSel, setPickerSel] = useState<string[]>([]);
  const [pickerMeta, setPickerMeta] = useState<Record<string, { product_id: string; priority: string; note: string }>>({});
  const [pickerEditMode, setPickerEditMode] = useState(false);

  // detail
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [copyStart, setCopyStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProposed, setShowProposed] = useState(false);
  const [deepLinkOpened, setDeepLinkOpened] = useState(false);

  // analytics / execution
  const [frequencies, setFrequencies] = useState<Array<{ classification: string; visits_per_month: number }>>([]);
  const [coverage, setCoverage] = useState<Array<{ classification: string; freq: number; doctors: number; expected: number; planned: number; coverage: number }>>([]);
  const [compliance, setCompliance] = useState<Array<{ user_id: string; name: string; totalPlanned: number; totalDone: number; adherence: number }>>([]);
  const [executionRows, setExecutionRows] = useState<Array<Record<string, any>>>([]);
  const [executionSummary, setExecutionSummary] = useState({ planned: 0, done: 0, missed: 0 });
  const [executionLoading, setExecutionLoading] = useState(false);
  const [current, setCurrent] = useState<Detail | null>(null);

  const days = periodDays(start, planPeriod);
  const lockPast = editMode === "rep-request" || (!isAdmin && !!editingPlanId);
  const visiblePlans = plans.filter(p => !planSearch.trim() || `${p.user_name} ${planPeriodLabel(p.period)} ${STATUS[p.status]?.label || ""} ${p.admin_note || ""} ${p.template_name || ""}`.toLowerCase().includes(planSearch.trim().toLowerCase()));
  const liveDiff = useMemo(() => editMode === "rep-request" || editMode === "admin" ? diffPlanItems<PlanItemLike>(originalItems.map(x => ({ ...x, doctor_name: docName(x.doctor_id), product_name: productMap.get(x.product_id) || "" })), items.map(x => ({ ...x, doctor_name: docName(x.doctor_id), product_name: productMap.get(x.product_id) || "" }))) : null, [editMode, originalItems, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveCounts = liveDiff ? { added: liveDiff.added.length, removed: liveDiff.removed.length, moved: liveDiff.moved.length, changed: liveDiff.changed.length, total: liveDiff.added.length + liveDiff.removed.length + liveDiff.moved.length + liveDiff.changed.length } : null;
  const newKeys = useMemo(() => new Set([...(liveDiff?.added || []), ...(liveDiff?.moved || []).map(p => p.to)].map(x => `${x.doctor_id}@${d10(x.planned_date)}`)), [liveDiff]);
  const reviewCount = summary.pending + (summary.change_requests || 0);

  async function load() {
    const p = new URLSearchParams();
    if (filter) p.set("status", filter);
    if (periodFilter) p.set("period", periodFilter);
    if (isAdmin && viewRepId) p.set("repId", viewRepId);
    try {
      const response = await fetch(`/api/plans?${p}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isPlanWorkspacePayload(payload)) throw new Error(String((payload as any)?.error || "تعذر تحميل الخطط"));
      setPlans(payload.plans as Plan[]); setTemplates((payload.templates || []) as SavedTemplate[]); setSummary(payload.summary as unknown as PlanSummary); setRepSummary((payload.repSummary || []) as RepPlanSummary[]); setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "تعذر تحميل الخطط"); }
    setLoaded(true);
  }
  async function loadReview() {
    const [a, b] = await Promise.all([
      isAdmin ? fetch("/api/plans?status=pending", { cache: "no-store" }).then(r => r.json()).catch(() => null) : Promise.resolve(null),
      fetch("/api/agenda/requests", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (a?.plans) setReviewPlans(a.plans);
    if (b?.requests) setQueue(b.requests);
  }
  async function loadExecution() {
    setExecutionLoading(true);
    const base = start || today; const e = new Date(base + "T12:00:00"); e.setDate(e.getDate() + 29);
    const p = new URLSearchParams({ start: base, end: iso(e) });
    if (isAdmin && viewRepId) p.set("repId", viewRepId);
    const r = await fetch(`/api/plans/calendar?${p}`, { cache: "no-store" }).then(x => x.json()).catch(() => null);
    if (r) { setExecutionRows(r.rows || []); setExecutionSummary(r.summary || { planned: 0, done: 0, missed: 0 }); }
    setExecutionLoading(false);
  }
  async function loadIQVIA(rep = viewRepId) {
    const fr = await fetch("/api/plans/frequencies").then(x => x.json()).catch(() => null);
    if (fr) setFrequencies(fr.frequencies || []);
    const cp = new URLSearchParams(); if (isAdmin && rep) cp.set("userId", rep);
    const cr = await fetch(`/api/plans/coverage?${cp}`).then(x => x.json()).catch(() => null);
    if (cr) setCoverage(cr.coverage || []);
    if (isAdmin) { const co = await fetch("/api/plans/compliance").then(x => x.json()).catch(() => null); if (co) setCompliance(co.compliance || []); }
  }
  const refreshAll = () => { void load(); void loadReview(); };
  useEffect(() => { void load(); }, [filter, periodFilter, viewRepId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadIQVIA(viewRepId); }, [viewRepId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadReview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!start) return;
    const s = new Date(start + "T12:00:00"); const e = new Date(s);
    e.setDate(e.getDate() + (planPeriod === "daily" ? 0 : planPeriod === "monthly" ? 29 : 6));
    setEnd(iso(e));
  }, [start, planPeriod]);
  // rep: the plan running today, with its visits
  const runningPlan = useMemo(() => isAdmin ? null : plans.find(p => p.status === "approved" && d10(p.period_start) <= today && d10(p.period_end) >= today) || null, [plans, isAdmin, today]);
  useEffect(() => { if (!runningPlan) { setCurrent(null); return; } fetch(`/api/plans/${runningPlan.id}`).then(r => r.ok ? r.json() : null).then(j => j?.plan && setCurrent(j)).catch(() => {}); }, [runningPlan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDoctors = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    const selectedCity = doctors.find(d => pickerSel.includes(d.id))?.city || "";
    const rank = (v?: string) => ({ A: 0, B: 1, C: 2 } as Record<string, number>)[String(v || "").toUpperCase()] ?? 3;
    return doctors.filter(d => !q || `${d.name} ${d.clinic_name} ${d.city}`.toLowerCase().includes(q)).sort((a, b) => Number(pickerSel.includes(b.id)) - Number(pickerSel.includes(a.id)) || Number(b.city === selectedCity) - Number(a.city === selectedCity) || rank(a.classification) - rank(b.classification) || String(a.city).localeCompare(String(b.city), "ar"));
  }, [pickerQ, doctors, pickerSel]);

  function openDay(date: string) {
    if (isWeekend(date) || isHoliday(date)) { toast("اليوم ده إجازة", "error"); return; }
    if (lockPast && date < today) { toast("اليوم ده فات — مينفعش يتعدل", "error"); return; }
    const list = itemsByDay[date] || [];
    setPickerSel(list.map(x => x.doctor_id));
    setPickerMeta(Object.fromEntries(list.map(x => [x.doctor_id, { product_id: x.product_id || "", priority: x.priority || "medium", note: x.note || "" }])));
    setPickerQ(""); setPickerEditMode(list.length === 0); setActiveDay(date);
  }
  function togglePicker(id: string) {
    if (!pickerSel.includes(id) && activeDay) {
      const dup = findFiveDayDuplicate(id, activeDay, items.filter(x => !(x.doctor_id === id && x.planned_date === activeDay)));
      if (dup && !confirm(`تنبيه: الطبيب ده موجود في الخطة يوم ${dup} (خلال 5 أيام). تضيفه تاني؟`)) return;
    }
    setPickerSel(prev => {
      if (prev.includes(id)) { setPickerMeta(m => { const n = { ...m }; delete n[id]; return n; }); return prev.filter(x => x !== id); }
      setPickerMeta(m => ({ ...m, [id]: { product_id: "", priority: "medium", note: "" } })); return [...prev, id];
    });
  }
  function saveDay() {
    if (!activeDay) return;
    setItemsByDay(prev => { const n = { ...prev }; if (pickerSel.length) n[activeDay] = pickerSel.map(id => ({ doctor_id: id, product_id: pickerMeta[id]?.product_id || "", note: pickerMeta[id]?.note || "", priority: pickerMeta[id]?.priority || "medium" })); else delete n[activeDay]; return n; });
    setActiveDay(null);
  }
  function removeFromDay(date: string, doctorId: string) {
    if (lockPast && date < today) return;
    setItemsByDay(prev => { const list = (prev[date] || []).filter(x => x.doctor_id !== doctorId); const n = { ...prev }; if (list.length) n[date] = list; else delete n[date]; return n; });
  }
  function clearAll() {
    if (lockPast) { setItemsByDay(prev => Object.fromEntries(Object.entries(prev).filter(([d]) => d < today))); return; }
    setItemsByDay({});
  }
  function resetBuilder() { setItemsByDay({}); setStart(""); setEnd(""); setEditingPlanId(null); setEditMode(null); setOriginalItems([]); setChangeNote(""); setTemplateName(""); }

  async function submitPlan() {
    if (!items.length) { toast("أضف زيارة واحدة على الأقل — اضغط على يوم واختر الأطباء", "error"); return; }
    if (!start || !end) { toast("حدد تاريخ بداية الخطة", "error"); return; }
    if (isAdmin && !adminPlanRepId) { toast("اختر المندوب الأول", "error"); return; }
    if (editMode === "rep-request") {
      if (!liveCounts?.total) { toast("مفيش أي تغيير عن الخطة المعتمدة", "error"); return; }
      if (changeNote.trim().length < 5) { toast("اكتب للمدير سبب التعديل (5 أحرف على الأقل)", "error"); return; }
    }
    setSaving(true);
    try {
      const payload = { period: planPeriod, period_start: start, period_end: end, items, target_visits: targetVisits, template_name: templateName, user_id: adminPlanRepId, note: editMode === "rep-direct" ? (changeNote.trim() || "تحديث الخطة قبل الاعتماد") : changeNote.trim() };
      const r = await fetch(editingPlanId ? `/api/plans/${editingPlanId}` : "/api/plans", { method: editingPlanId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await r.json().catch(() => null);
      if (!r.ok) { toast(result?.error || "فشل الحفظ", "error"); return; }
      if (r.status === 202) toast(result?.replaced ? "اتحدّث طلب التعديل واتبعت للمدير ✓" : "اتبعت طلب التعديل للمدير ✓ — خطتك المعتمدة شغالة لحد ما يوافق", "success");
      else if (result?.warnings?.length) toast(`اتحفظت الخطة مع تنبيهات:\n${result.warnings.join("\n")}`, "success");
      else toast(editingPlanId ? "اتحفظت التعديلات ✓" : isAdmin ? "اتعملت الخطة واتعتمدت ✓" : "اتبعتت الخطة للمدير ✓", "success");
      const pid = editingPlanId || result?.id;
      if (isAdmin) setViewRepId(adminPlanRepId);
      resetBuilder(); setTab(isAdmin ? "plans" : "overview"); refreshAll(); void loadIQVIA();
      if (pid) void openDetailById(pid);
    } catch { toast("تعذر الاتصال بالخادم", "error"); } finally { setSaving(false); }
  }

  async function suggestIQVIA() {
    if (!start) { toast("حدد بداية الخطة الأول", "error"); return; }
    const ds = workDays(start, planPeriod).map(d => d.date).filter(d => !lockPast || d >= today); if (!ds.length) return;
    const target = Math.min(50, Math.max(1, targetVisits || 10, ds.length * 9));
    const focus = doctors.find(d => items.some(i => i.doctor_id === d.id));
    const q = new URLSearchParams({ period: planPeriod, start, end: end || start, target: String(target), focusCity: focus?.city || "", focusClinic: focus?.clinic_name || "" });
    const r = await fetch(`/api/plans/suggest?${q}`).then(x => x.json()).catch(() => null);
    if (!r?.suggestions?.length) { toast("مفيش اقتراحات", "info"); return; }
    const grouped = distributeSuggestionsByArea((r.suggestions as Array<{ id: string; city?: string; clinic_name?: string; classification?: string }>).slice(0, target), ds);
    const next = { ...itemsByDay };
    for (const date of ds) { next[date] = [...(next[date] || [])]; for (const s of grouped[date] || []) if (!next[date].some(x => x.doctor_id === s.id)) next[date].push({ doctor_id: s.id, product_id: "", note: "", priority: "medium" }); if (!next[date].length) delete next[date]; }
    setItemsByDay(next); toast("اتوزعت الاقتراحات حسب المنطقة والتصنيف — راجعها قبل الإرسال", "success");
  }
  async function applySavedTemplate(t: SavedTemplate) {
    if (!templateCopyStart) { toast("اختار بداية الفترة الجديدة الأول", "error"); return; }
    const r = await fetch(`/api/plans/${t.id}`).then(x => x.json()).catch(() => null);
    if (!r?.plan) { toast("تعذر تحميل القالب", "error"); return; }
    const shifted = shiftPlanItems((r.items as Array<Record<string, any>>).map(row => ({ doctor_id: String(row.doctor_id || ""), planned_date: d10(row.planned_date), product_id: "", note: "", priority: "medium" })), d10(r.plan.period_start), templateCopyStart);
    resetBuilder(); setPlanPeriod((String(r.plan.period) as PlanPeriod) || "weekly"); setStart(templateCopyStart); setTargetVisits(Number(r.plan.target_visits || shifted.length || 1)); setTemplateName(t.name); setItemsByDay(groupDays(shifted)); setTemplateCopyStart("");
    if (isAdmin) setAdminPlanRepId(String(r.plan.user_id));
  }

  async function openDetailById(id: string) {
    setDetailLoading(true); setShowProposed(false); setDecisionNote("");
    try {
      const response = await fetch(`/api/plans/${id}`, { cache: "no-store" }); const r = await response.json().catch(() => null);
      if (!response.ok || !r?.plan) { toast(r?.error || "تعذر تحميل تفاصيل الخطة", "error"); return; }
      setDetail(r);
    } finally { setDetailLoading(false); }
  }
  useEffect(() => { if (!initialPlanId || deepLinkOpened) return; setDeepLinkOpened(true); void openDetailById(initialPlanId); }, [initialPlanId, deepLinkOpened]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decidePlan(status: "approved" | "needs_revision" | "rejected") {
    if (!detail || busy) return;
    if (status !== "approved" && decisionNote.trim().length < 3) { toast("اكتب ملاحظة للمندوب توضح المطلوب", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/plans/${detail.plan.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, admin_note: decisionNote.trim() }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { toast(j?.error || "فشل", "error"); return; }
      toast(status === "approved" ? "اتعتمدت الخطة ✓" : status === "rejected" ? "اترفضت الخطة" : "اتبعت طلب التعديل للمندوب", "success");
      refreshAll(); await openDetailById(String(detail.plan.id));
    } catch { toast("تعذر الاتصال بالخادم", "error"); } finally { setBusy(false); }
  }
  async function decideRequest(id: string, status: "approved" | "rejected", planId?: string) {
    if (busy) return;
    if (status === "rejected" && decisionNote.trim().length < 3 && detail) { toast("اكتب سبب الرفض للمندوب", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/agenda/requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, note: decisionNote.trim() }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { toast(j?.error || "فشل", "error"); return; }
      toast(status === "approved" ? "اتطبق التعديل على الخطة ✓" : "اترفض طلب التعديل — الخطة المعتمدة زي ما هي", "success");
      refreshAll(); const pid = planId || (detail ? String(detail.plan.id) : ""); if (pid && detail) await openDetailById(pid);
    } catch { toast("تعذر الاتصال بالخادم", "error"); } finally { setBusy(false); }
  }
  async function withdrawRequest(id: string) {
    if (!confirm("تسحب طلب التعديل؟ الخطة المعتمدة هتفضل زي ما هي.")) return;
    const r = await fetch(`/api/agenda/requests/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.error || "فشل", "error"); return; }
    toast("اتسحب الطلب", "success"); refreshAll(); if (detail) await openDetailById(String(detail.plan.id));
  }
  function startEdit(useProposed = false) {
    if (!detail) return;
    const p = detail.plan;
    const mode: EditMode = isAdmin ? "admin" : String(p.status) === "approved" ? "rep-request" : "rep-direct";
    setOriginalItems(detail.items.map(row => ({ doctor_id: String(row.doctor_id), planned_date: d10(row.planned_date), product_id: String(row.product_id || ""), note: String(row.note || ""), priority: String(row.priority || "medium") })));
    setEditingPlanId(String(p.id)); setEditMode(mode); setPlanPeriod((String(p.period) as PlanPeriod) || "weekly"); setAdminPlanRepId(String(p.user_id));
    setStart(d10(p.period_start)); setEnd(d10(p.period_end)); setTargetVisits(Number(p.target_visits || detail.items.length || 1)); setTemplateName(String(p.template_name || ""));
    setItemsByDay(groupDays(useProposed && detail.change_request ? detail.change_request.proposed as Array<Record<string, any>> : detail.items));
    setChangeNote(useProposed && detail.change_request ? detail.change_request.note : "");
    setDetail(null); setTab("builder"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function prepareCopy() {
    if (!detail || !copyStart) { toast("اختار تاريخ بداية الفترة الجديدة", "error"); return; }
    const shifted = shiftPlanItems(detail.items.map(row => ({ doctor_id: String(row.doctor_id || ""), planned_date: d10(row.planned_date), product_id: String(row.product_id || ""), note: "", priority: String(row.priority || "medium") })), d10(detail.plan.period_start), copyStart);
    resetBuilder(); setPlanPeriod((String(detail.plan.period) as PlanPeriod) || "weekly"); setStart(copyStart); setTargetVisits(Number(detail.plan.target_visits || shifted.length || 1)); setTemplateName(`${String(detail.plan.template_name || "")} - نسخة`.trim()); setItemsByDay(groupDays(shifted));
    if (isAdmin) setAdminPlanRepId(String(detail.plan.user_id));
    setDetail(null); setCopyStart(""); setTab("builder"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function sendComment() {
    if (!detail || !commentBody.trim()) return;
    await fetch(`/api/plans/${detail.plan.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: commentBody }) });
    setCommentBody(""); await openDetailById(String(detail.plan.id));
  }
  function goTab(t: Tab) { setTab(t); if (t === "execution") void loadExecution(); if (t === "review") void loadReview(); if (t !== "builder" && detail && device === "desktop" && t !== "review") setDetail(null); }

  // ───────────── render helpers ─────────────
  const repName = (id: string) => reps.find(r => r.id === id)?.name || "";
  const tabs: Array<[Tab, string, number?]> = [["overview", "نظرة عامة"], ...(isAdmin ? [["review", "الاعتماد", reviewCount] as [Tab, string, number]] : []), ["builder", editingPlanId ? "تعديل الخطة" : isAdmin ? "خطة جديدة" : "رتّب خطتك"], ["plans", "كل الخطط"], ["execution", "التنفيذ"]];

  const kpi = (label: string, value: number | string, sub: string, tone = "", onClick?: () => void) => <button type="button" onClick={onClick} disabled={!onClick} className={`${card} rounded-2xl p-3.5 text-right transition enabled:hover:border-[var(--sky-border)] enabled:hover:shadow-sm`}><div className="text-xs text-[var(--muted)]">{label}</div><div className={`mt-1 text-2xl font-extrabold text-[var(--navy)] ${tone}`}>{value}</div><div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{sub}</div></button>;

  function planCard(p: Plan) {
    const prog = planTargetProgress(p.items_count, p.target_visits);
    const running = p.status === "approved" && d10(p.period_start) <= today && d10(p.period_end) >= today;
    return <button key={p.id} type="button" onClick={() => void openDetailById(p.id)} className={`group w-full rounded-2xl border bg-white p-4 text-right transition hover:border-[var(--sky-border)] hover:shadow-md ${detail?.plan.id === p.id ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/10" : "border-[var(--border)]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isAdmin && <div className="truncate text-sm font-extrabold text-[var(--navy)]">{p.user_name}</div>}
          <div className={`${isAdmin ? "text-xs text-[var(--muted)]" : "text-sm font-extrabold text-[var(--navy)]"}`}>خطة {planPeriodLabel(p.period)} · {fd(p.period_start)} → {fd(p.period_end)}</div>
        </div>
        <Pill status={p.status} small />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 font-bold">{p.items_count} زيارة</span>
        {p.target_visits ? <span className="rounded-full bg-[var(--sky-light)] px-2 py-0.5 font-bold text-[var(--navy)]">الهدف {p.target_visits}</span> : null}
        {running && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">● شغالة دلوقتي</span>}
        {(p.pending_changes || 0) > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">✎ طلب تعديل معلّق</span>}
        {p.template_name && <span className="truncate rounded-full bg-slate-50 px-2 py-0.5 text-[var(--muted)]">{p.template_name}</span>}
      </div>
      {p.target_visits ? <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${prog}%` }} /></div></div> : null}
      {p.admin_note && <div className="mt-2 line-clamp-1 text-[11px] text-[var(--muted)]">💬 {p.admin_note}</div>}
    </button>;
  }

  function renderDetail(inline?: boolean) {
    if (!detail) return null;
    const p = detail.plan; const status = String(p.status); const cr = detail.change_request;
    const doneCount = detail.items.filter(i => i.done).length;
    const pct = detail.items.length ? Math.round(doneCount / detail.items.length * 100) : 0;
    const groups: Record<string, Array<Record<string, any>>> = {};
    const source = showProposed && cr ? cr.proposed as Array<Record<string, any>> : detail.items;
    for (const row of source) (groups[d10(row.planned_date)] ||= []).push(row);
    const dayList = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    const addedKeys = new Set(showProposed && cr ? [...cr.diff.added, ...cr.diff.moved.map(m => m.to)].map(x => `${x.doctor_id}@${d10(x.planned_date)}`) : []);
    const wide = !inline && device === "desktop";
    const canReview = isAdmin && canAdminReviewPlan(status);
    const repCanEdit = !isAdmin && ["approved", "pending", "needs_revision", "rejected", "draft"].includes(status) && d10(p.period_end) >= today;

    const requestBox = cr && <section className="rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-extrabold text-amber-900">✎ طلب تعديل على الخطة المعتمدة</div><div className="text-[11px] text-amber-800/80">{cr.requested_by_name} · {fdt(cr.created_at)} — الخطة الحالية شغالة لحد القرار</div></div>
        <CountChips c={cr.counts} />
      </div>
      {cr.note && <div className="mt-3 rounded-xl bg-white p-3 text-sm shadow-sm"><span className="text-[11px] font-bold text-[var(--muted)]">سبب التعديل</span><div className="mt-0.5 whitespace-pre-wrap">{cr.note}</div></div>}
      <div className="mt-3"><DiffList diff={cr.diff} name={x => x.doctor_name || docName(x.doctor_id)} /></div>
      <button type="button" onClick={() => setShowProposed(v => !v)} className="mt-2 text-xs font-bold text-[var(--navy)] underline">{showProposed ? "اعرض الخطة الحالية" : "اعرض الخطة بعد التعديل"}</button>
      {isAdmin ? <div className="mt-3 space-y-2">
        <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} rows={2} placeholder="ملاحظة للمندوب (مطلوبة في حالة الرفض)" className="w-full rounded-xl border border-[var(--border)] p-2.5 text-sm" />
        <div className="flex gap-2"><button disabled={busy} onClick={() => void decideRequest(cr.id, "approved")} className={`${btn} flex-1 bg-emerald-600 text-white hover:bg-emerald-700`}><Icon name="check" size={15} /> اعتمد التعديل</button><button disabled={busy} onClick={() => void decideRequest(cr.id, "rejected")} className={`${btn} flex-1 border border-red-200 bg-white text-red-700`}>ارفض</button></div>
      </div> : <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => startEdit(true)} className={btnGhost}>✎ عدّل الطلب</button><button onClick={() => void withdrawRequest(cr.id)} className={`${btn} border border-red-200 bg-white text-red-700`}>اسحب الطلب</button><span className="self-center text-[11px] text-amber-800">⏳ مستني موافقة المدير</span></div>}
    </section>;

    const reviewBox = canReview && <section className="rounded-2xl border-2 border-[var(--sky-border)] bg-[var(--sky-light)]/60 p-4">
      <div className="font-extrabold text-[var(--navy)]">قرار الاعتماد</div>
      <div className="text-[11px] text-[var(--muted)]">{detail.items.length} زيارة على {Object.keys(groups).length} يوم{p.target_visits ? ` · الهدف ${p.target_visits}` : ""}</div>
      <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} rows={2} placeholder="ملاحظة للمندوب (مطلوبة لطلب التعديل أو الرفض)" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white p-2.5 text-sm" />
      <div className="mt-2 grid grid-cols-3 gap-2"><button disabled={busy} onClick={() => void decidePlan("approved")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><Icon name="check" size={15} /> اعتماد</button><button disabled={busy} onClick={() => void decidePlan("needs_revision")} className={`${btn} border border-sky-300 bg-white text-sky-800`}>اطلب تعديل</button><button disabled={busy} onClick={() => void decidePlan("rejected")} className={`${btn} border border-red-200 bg-white text-red-700`}>رفض</button></div>
    </section>;

    const visits = <section className="space-y-2">
      <div className="flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">{showProposed ? "الخطة بعد التعديل المقترح" : "زيارات الخطة"}</div>{!showProposed && <span className="text-xs text-[var(--muted)]">اتنفذ {doneCount} من {detail.items.length}</span>}</div>
      {!showProposed && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>}
      <div className={wide ? "grid grid-cols-2 gap-2" : "space-y-2"}>
        {dayList.map(([date, rows]) => <div key={date} className={`overflow-hidden rounded-2xl border ${date === today ? "border-[var(--navy)]" : "border-[var(--border)]"}`}>
          <div className={`flex items-center justify-between px-3 py-2 text-sm font-extrabold ${date === today ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--navy)]"}`}><span>{fd(date, { weekday: "long", day: "numeric", month: "short" })}{date === today ? " · النهارده" : ""}</span><span className="text-xs font-bold opacity-70">{rows.length}</span></div>
          <div className="divide-y divide-[var(--border)]">{rows.map((it, i) => { const isNew = addedKeys.has(`${it.doctor_id}@${d10(it.planned_date)}`); return <div key={i} className={`flex items-center gap-2 px-3 py-2 ${isNew ? "bg-emerald-50" : it.done ? "bg-emerald-50/40" : ""}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${it.done ? "bg-emerald-600 text-white" : isNew ? "bg-emerald-200 text-emerald-900 font-extrabold" : "border bg-white text-[var(--muted)]"}`}>{it.done ? <Icon name="check" size={12} /> : isNew ? "+" : ""}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{String(it.doctor_name || docName(String(it.doctor_id)))}</div><div className="truncate text-[11px] text-[var(--muted)]">{String(it.clinic_name || doctorMap.get(String(it.doctor_id))?.clinic_name || "")}{it.product_name ? ` · ${it.product_name}` : ""}{it.priority && it.priority !== "medium" ? ` · أولوية ${PRIO[String(it.priority)] || it.priority}` : ""}</div></div>
            {!isAdmin && !it.done && !showProposed && status === "approved" && date <= today && <a href={`/visits/new?doctorId=${it.doctor_id}${it.product_id ? `&productId=${it.product_id}` : ""}`} className="shrink-0 rounded-lg bg-[var(--navy)] px-2.5 py-1 text-[11px] font-bold text-white">سجّل</a>}
          </div>; })}</div>
        </div>)}
        {!dayList.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--muted)]">مفيش زيارات</div>}
      </div>
    </section>;

    const tools = <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {isAdmin && <button onClick={() => startEdit(false)} className={btnPrimary}><Icon name="edit" size={14} /> تعديل مباشر</button>}
        {repCanEdit && !cr && <button onClick={() => startEdit(false)} className={btnPrimary}><Icon name="edit" size={14} /> {status === "approved" ? "اطلب تعديل على الخطة" : "عدّل الخطة"}</button>}
        <a href={`/calendar?date=${d10(p.period_start)}`} className={btnGhost}>🗓️ في المخطط</a>
        <a href={`/api/exports/plans?id=${p.id}&format=xlsx`} className={btnGhost}>Excel</a>
      </div>
      {!isAdmin && status === "approved" && !cr && <div className="text-[11px] text-[var(--muted)]">أي تعديل على الخطة المعتمدة بيتبعت للمدير، والخطة الحالية بتفضل شغالة لحد ما يوافق.</div>}
      <details className="rounded-2xl border border-[var(--border)] bg-white"><summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold">⧉ انسخ الخطة لفترة تانية</summary><div className="flex gap-2 border-t border-[var(--border)] p-3"><input type="date" value={copyStart} onChange={e => setCopyStart(e.target.value)} className={field} /><button onClick={prepareCopy} className={`${btnPrimary} shrink-0`}>جهّز النسخة</button></div></details>
    </section>;

    const comments = <section className="rounded-2xl border border-[var(--border)] bg-white p-3">
      <div className="mb-2 text-sm font-extrabold text-[var(--navy)]">💬 النقاش ({detail.comments.length})</div>
      <div className="max-h-[220px] space-y-2 overflow-auto">{detail.comments.map(c => <div key={c.id} className="rounded-xl bg-[var(--bg)] p-2.5"><div className="text-[11px] font-bold">{c.user_name} <span className="font-normal text-[var(--muted)]">{fdt(c.created_at)}</span></div><div className="whitespace-pre-wrap text-sm">{c.body}</div></div>)}{!detail.comments.length && <div className="text-xs text-[var(--muted)]">لسه مفيش تعليقات</div>}</div>
      <div className="mt-2 flex gap-2"><input value={commentBody} onChange={e => setCommentBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void sendComment(); }} placeholder="اكتب تعليق…" className={field} /><button onClick={() => void sendComment()} className={`${btnGhost} shrink-0`}>إرسال</button></div>
    </section>;

    const history = (detail.change_history.length > 0 || detail.revisions.length > 0) && <details className="rounded-2xl border border-[var(--border)] bg-white"><summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold">🕘 سجل التعديلات ({detail.change_history.length + detail.revisions.length})</summary><div className="space-y-2 border-t border-[var(--border)] p-3">
      {detail.change_history.map(h => <div key={h.id} className="rounded-xl bg-[var(--bg)] p-2.5 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-bold">{h.requested_by_name} · {h.summary}</span><span className={`rounded-full px-2 py-0.5 font-bold ${h.status === "approved" ? "bg-emerald-100 text-emerald-800" : h.status === "rejected" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"}`}>{HIST[h.status] || h.status}</span></div>{h.note && <div className="mt-1 text-[var(--muted)]">«{h.note}»</div>}{h.admin_note && <div className="mt-1">رد المدير: {h.admin_note}</div>}<div className="mt-1 text-[10px] text-[var(--muted)]">{fdt(h.created_at)}{h.reviewed_by_name ? ` · ${h.reviewed_by_name}` : ""}</div></div>)}
      {detail.revisions.map(r => <div key={r.id} className="rounded-xl bg-[var(--bg)] p-2.5 text-xs"><span className="font-bold">{r.user_name}</span> عدّل قبل الاعتماد — «{r.note}» <span className="text-[10px] text-[var(--muted)]">{fdt(r.created_at)}</span></div>)}
    </div></details>;

    const head = <div className="flex flex-wrap items-center gap-2">
      <Pill status={status} />
      {isAdmin && <span className="text-sm font-extrabold text-[var(--navy)]">{String(p.user_name || "")}</span>}
      <span className="text-sm text-[var(--muted)]">خطة {planPeriodLabel(String(p.period))} · {fd(p.period_start, { weekday: "short", day: "numeric", month: "short" })} → {fd(p.period_end, { day: "numeric", month: "short" })}</span>
      {p.target_visits ? <span className="rounded-full bg-[var(--sky-light)] px-2 py-0.5 text-xs font-bold text-[var(--navy)]">الهدف {String(p.target_visits)}</span> : null}
      {p.approved_by_name ? <span className="text-[11px] text-[var(--muted)]">· اعتمدها {String(p.approved_by_name)}</span> : null}
    </div>;
    const adminNoteBox = p.admin_note ? <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm"><span className="text-[11px] font-bold text-sky-800">ملاحظة المدير</span><div>{String(p.admin_note)}</div></div> : null;

    if (wide) return <div className="space-y-3">{head}{adminNoteBox}<div className="grid grid-cols-[1fr_360px] gap-4"><div className="space-y-3">{visits}</div><div className="space-y-3">{requestBox}{reviewBox}{tools}{comments}{history}</div></div></div>;
    return <div className="space-y-3">{head}{adminNoteBox}{requestBox}{reviewBox}{visits}{tools}{comments}{history}</div>;
  }

  const inlineReview = device === "desktop" && tab === "review";

  // ───────────── views ─────────────
  const reviewQueue = <div className="space-y-3">
    {queue.length > 0 && <div><div className="mb-2 px-1 text-xs font-extrabold text-amber-800">✎ طلبات تعديل على خطط معتمدة ({queue.length})</div><div className="space-y-2">{queue.map(q => { const rep = q.proposed_items.find(o => o.op === "replace"); const c = rep?.summary || { added: q.proposed_items.filter(o => o.op === "add").length, removed: 0, moved: q.proposed_items.filter(o => o.op === "move").length, changed: 0 }; return <button key={q.id} onClick={() => void openDetailById(q.plan_id)} className={`w-full rounded-2xl border bg-white p-3 text-right transition hover:shadow-md ${detail?.plan.id === q.plan_id ? "border-amber-400 ring-2 ring-amber-200" : "border-amber-200"}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-extrabold text-[var(--navy)]">{q.requested_by_name}</span><span className="shrink-0 text-[10px] text-[var(--muted)]">{fdt(q.created_at)}</span></div><div className="text-[11px] text-[var(--muted)]">خطة {fd(q.ps)} → {fd(q.pe)}</div><div className="mt-1.5"><CountChips c={c} size="xs" /></div>{q.note && <div className="mt-1 line-clamp-1 text-[11px] text-[var(--muted)]">«{q.note}»</div>}</button>; })}</div></div>}
    <div><div className="mb-2 px-1 text-xs font-extrabold text-[var(--navy)]">📥 خطط جديدة بانتظار الاعتماد ({reviewPlans.length})</div><div className="space-y-2">{reviewPlans.map(p => planCard(p))}</div></div>
    {!queue.length && !reviewPlans.length && <div className={`${card} p-8 text-center`}><div className="text-3xl">🎉</div><div className="mt-2 font-extrabold text-[var(--navy)]">مفيش حاجة مستنية قرارك</div><div className="text-sm text-[var(--muted)]">كل الخطط والطلبات متراجعة</div></div>}
  </div>;

  const coverageCards = coverage.length > 0 && <div className={`${card} p-4`}>
    <div className="mb-3 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">تغطية الشهر حسب التصنيف</div><span className="text-[11px] text-[var(--muted)]">{isAdmin && viewRepId ? repName(viewRepId) : isAdmin ? "كل الفريق" : "خطتك"}</span></div>
    <div className="grid grid-cols-3 gap-2">{coverage.map(c => { const tone = c.coverage >= 80 ? "emerald" : c.coverage >= 50 ? "amber" : "red"; return <div key={c.classification} className="rounded-2xl border border-[var(--border)] p-3 text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${classTone(c.classification)}`}>{c.classification}</div><div className={`mt-2 text-xl font-extrabold ${tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-red-700"}`}>{c.coverage}%</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, c.coverage)}%` }} /></div><div className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">{c.planned}/{c.expected} زيارة · {c.doctors} طبيب · {c.freq}/شهر</div></div>; })}</div>
  </div>;

  const overview = <div className="space-y-3">
    {reviewCount > 0 && isAdmin && <button onClick={() => goTab("review")} className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-right"><span className="text-lg">🔔</span><span className="font-bold text-amber-900">محتاج قرارك:</span>{summary.pending > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{summary.pending} خطة جديدة</span>}{(summary.change_requests || 0) > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{summary.change_requests} طلب تعديل</span>}<span className="mr-auto text-sm font-bold text-[var(--navy)]">افتح الاعتماد ‹</span></button>}
    {!isAdmin && (summary.needs_revision > 0 || queue.length > 0) && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm">{summary.needs_revision > 0 && <button onClick={() => { setFilter("needs_revision"); goTab("plans"); }} className="rounded-full bg-white px-3 py-1 font-bold text-sky-800">✎ {summary.needs_revision} خطة محتاجة تعديل منك</button>}{queue.length > 0 && <span className="rounded-full bg-white px-3 py-1 font-bold text-amber-800">⏳ {queue.length} طلب تعديل مستني المدير</span>}</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {kpi("كل الخطط", summary.total, `${summary.approved} معتمدة`, "", () => { setFilter(""); goTab("plans"); })}
      {kpi("بانتظار الاعتماد", summary.pending, isAdmin ? "خطط جديدة" : "عند المدير", "text-amber-700", () => isAdmin ? goTab("review") : (setFilter("pending"), goTab("plans")))}
      {kpi("طلبات تعديل", summary.change_requests || 0, "على خطط معتمدة", "text-amber-700", isAdmin ? () => goTab("review") : undefined)}
      {kpi("تحتاج تعديل", summary.needs_revision, "رجعت للمندوب", "text-sky-700", () => { setFilter("needs_revision"); goTab("plans"); })}
      {kpi("زيارات مخططة", summary.planned_visits, "في كل الخطط")}
    </div>
    <div className="grid gap-3 xl:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        {!isAdmin && <div className={`${card} overflow-hidden`}>
          {runningPlan && current ? (() => { const todayRows = current.items.filter(i => d10(i.planned_date) === today); const done = current.items.filter(i => i.done).length; const pct = current.items.length ? Math.round(done / current.items.length * 100) : 0; return <>
            <div className="bg-[var(--navy)] p-4 text-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs text-white/60">الخطة الشغالة دلوقتي</div><div className="text-lg font-extrabold">خطة {planPeriodLabel(runningPlan.period)} · {fd(runningPlan.period_start)} → {fd(runningPlan.period_end)}</div></div><button onClick={() => void openDetailById(runningPlan.id)} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25">التفاصيل والتعديل ‹</button></div>
              <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} /></div><span className="text-sm font-extrabold">{done}/{current.items.length}</span></div>
              {current.change_request && <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-100">⏳ عندك طلب تعديل مستني المدير · {diffSummaryText(current.change_request.counts)}</div>}</div>
            <div className="p-4"><div className="mb-2 text-sm font-extrabold text-[var(--navy)]">زيارات النهارده ({todayRows.length})</div>
              <div className="grid gap-2 sm:grid-cols-2">{todayRows.map((it, i) => <div key={i} className={`flex items-center gap-2 rounded-xl border p-2.5 ${it.done ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)]"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${it.done ? "bg-emerald-600 text-white" : "bg-[var(--bg)]"}`}>{it.done ? <Icon name="check" size={13} /> : <span className={`h-2 w-2 rounded-full ${it.priority === "high" || it.priority === "urgent" ? "bg-red-500" : "bg-slate-300"}`} />}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{it.doctor_name}</div><div className="truncate text-[11px] text-[var(--muted)]">{it.clinic_name}{it.product_name ? ` · ${it.product_name}` : ""}</div></div>{!it.done && <a href={`/visits/new?doctorId=${it.doctor_id}${it.product_id ? `&productId=${it.product_id}` : ""}`} className="rounded-lg bg-[var(--navy)] px-2.5 py-1.5 text-[11px] font-bold text-white">سجّل</a>}</div>)}{!todayRows.length && <div className="rounded-xl border border-dashed p-4 text-center text-sm text-[var(--muted)] sm:col-span-2">مفيش زيارات مخططة النهارده</div>}</div></div>
          </>; })() : <div className="flex flex-col items-center gap-3 p-8 text-center"><div className="text-4xl">🗓️</div><div className="text-lg font-extrabold text-[var(--navy)]">{loaded ? "مفيش خطة معتمدة شغالة النهارده" : "جاري التحميل…"}</div><div className="max-w-md text-sm text-[var(--muted)]">رتّب أسبوعك: اختار الأيام، وزّع الأطباء حسب المنطقة والتصنيف، وابعتها للمدير يعتمدها.</div><button onClick={() => goTab("builder")} className={btnPrimary}>+ رتّب خطة جديدة</button></div>}
        </div>}
        {isAdmin && <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between p-4"><div className="font-extrabold text-[var(--navy)]">الفريق والالتزام بالخطط</div><span className="text-[11px] text-[var(--muted)]">اضغط على مندوب لعرض خططه</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">المندوب</th><th className="p-3 text-right">الخطط</th><th className="p-3 text-right">معلّق</th><th className="p-3 text-right">زيارات مخططة</th><th className="w-56 p-3 text-right">الالتزام (30 يوم)</th></tr></thead>
            <tbody>{repSummary.map(r => { const c = compliance.find(x => x.user_id === r.id); const a = c?.adherence ?? null; return <tr key={r.id} onClick={() => { setViewRepId(r.id); goTab("plans"); }} className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--sky-light)]"><td className="p-3 font-bold">{r.name}{!r.active && <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">موقوف</span>}</td><td className="p-3">{r.total} <span className="text-[11px] text-[var(--muted)]">({r.approved} معتمدة)</span></td><td className="p-3">{r.pending ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{r.pending}</span> : "—"}</td><td className="p-3">{r.planned_visits}</td><td className="p-3">{a === null ? <span className="text-[var(--muted)]">—</span> : <div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${a >= 80 ? "bg-emerald-500" : a >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${a}%` }} /></div><span className="w-20 text-xs font-bold">{a}% <span className="font-normal text-[var(--muted)]">({c?.totalDone}/{c?.totalPlanned})</span></span></div>}</td></tr>; })}</tbody></table></div>
        </div>}
        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">{isAdmin ? "آخر الخطط" : "خططك"}</div><button onClick={() => goTab("plans")} className="text-xs font-bold text-[var(--navy)]">الكل ‹</button></div>
          <div className="grid gap-2 md:grid-cols-2">{plans.slice(0, 6).map(p => planCard(p))}{loaded && !plans.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--muted)] md:col-span-2">لسه مفيش خطط</div>}</div>
        </div>
      </div>
      <div className="space-y-3">
        {coverageCards}
        <div className={`${card} p-4`}><div className="mb-3 font-extrabold text-[var(--navy)]">إزاي الدورة بتمشي</div><ol className="space-y-3 text-sm">{[["1", "المندوب يرتب خطته", "يوزّع الأطباء على الأيام ويبعتها"], ["2", "المدير يعتمد", "أو يطلب تعديل بملاحظة واضحة"], ["3", "التنفيذ", "كل زيارة بتتسجل بتتعلّم في الخطة"], ["4", "تعديل بعد الاعتماد", "المندوب يقترح، والخطة القديمة شغالة لحد موافقة المدير"]].map(([n, t, s]) => <li key={n} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-extrabold text-white">{n}</span><div><div className="font-bold">{t}</div><div className="text-[11px] text-[var(--muted)]">{s}</div></div></li>)}</ol></div>
        {isAdmin && frequencies.length > 0 && <details className={`${card} overflow-hidden`}><summary className="cursor-pointer list-none p-4 font-extrabold text-[var(--navy)]">⚙️ معدل الزيارات لكل تصنيف (IQVIA)</summary><div className="space-y-2 border-t border-[var(--border)] p-4">
          {frequencies.map(f => <div key={f.classification} className="flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${classTone(f.classification)}`}>{f.classification}</span><input type="number" min={0} max={30} value={f.visits_per_month} onChange={e => setFrequencies(frequencies.map(x => x.classification === f.classification ? { ...x, visits_per_month: parseInt(e.target.value || "0", 10) } : x))} className={`${field} !h-9 w-20 text-center`} /><span className="text-xs text-[var(--muted)]">زيارة / شهر</span></div>)}
          <button onClick={async () => { await fetch("/api/plans/frequencies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frequencies }) }); toast("اتحفظ ✓", "success"); void loadIQVIA(); }} className={`${btnPrimary} w-full`}>حفظ</button>
        </div></details>}
      </div>
    </div>
  </div>;

  const plansView = <div className="space-y-3">
    <div className={`${card} p-3`}><div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <input value={planSearch} onChange={e => setPlanSearch(e.target.value)} placeholder="🔎 دوّر بالمندوب أو الحالة أو اسم القالب" className={`${field} lg:flex-1`} />
      <div className="flex gap-2 overflow-x-auto">{[["", "الكل"], ["pending", "بانتظار"], ["approved", "معتمدة"], ["needs_revision", "تحتاج تعديل"], ["rejected", "مرفوضة"]].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${filter === k ? "bg-[var(--navy)] text-white" : "border border-[var(--border)] bg-white"}`}>{l}</button>)}</div>
      <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className={`${field} lg:w-36`}><option value="">كل الفترات</option>{PLAN_PERIODS.map(p => <option key={p} value={p}>{planPeriodLabel(p)}</option>)}</select>
    </div>
      {isAdmin && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1"><button onClick={() => setViewRepId("")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${!viewRepId ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)]"}`}>كل المناديب</button>{reps.map(r => { const s = repSummary.find(x => x.id === r.id); return <button key={r.id} onClick={() => { setViewRepId(r.id); if (representativeCanReceivePlan(r.active)) setAdminPlanRepId(r.id); }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${viewRepId === r.id ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)]"} ${!r.active ? "opacity-60" : ""}`}>{r.name}{s?.pending ? <span className="mr-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">{s.pending}</span> : null}</button>; })}</div>}
    </div>
    {loadError && <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{loadError}</span><button onClick={() => void load()} className={btnGhost}>إعادة المحاولة</button></div>}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{visiblePlans.map(p => planCard(p))}</div>
    {loaded && !visiblePlans.length && <div className={`${card} p-8 text-center text-sm text-[var(--muted)]`}>مفيش خطط مطابقة للفلاتر</div>}
  </div>;

  const classMix = useMemo(() => { const m: Record<string, number> = { A: 0, B: 0, C: 0 }; for (const it of items) { const c = String(doctorMap.get(it.doctor_id)?.classification || "").toUpperCase(); if (c in m) m[c]++; } return m; }, [items, doctorMap]);
  const filledDays = Object.keys(itemsByDay).length;
  const modeBanner = editMode === "rep-request" ? { tone: "border-amber-300 bg-amber-50 text-amber-900", t: "✎ تعديل على خطة معتمدة", s: "التعديلات هتتبعت للمدير كطلب — خطتك المعتمدة الحالية بتفضل شغالة لحد ما يوافق. الأيام اللي فاتت مقفولة." }
    : editMode === "admin" ? { tone: "border-sky-300 bg-sky-50 text-sky-900", t: `تعديل مباشر — ${repName(adminPlanRepId)}`, s: "كمدير، التعديل بيتطبق فورًا والمندوب بيوصله إشعار." }
      : editMode === "rep-direct" ? { tone: "border-sky-300 bg-sky-50 text-sky-900", t: "تعديل خطة قبل الاعتماد", s: "هتتبعت للمدير تاني للمراجعة." } : null;

  const dayCard = (d: DayCell) => {
    const off = d.weekend || !!d.holiday; const locked = lockPast && d.date < today; const list = itemsByDay[d.date] || [];
    const isPhone = device === "phone";
    return <div key={d.date} role="button" tabIndex={0} onClick={() => !off && !locked && openDay(d.date)} onKeyDown={e => { if (e.key === "Enter" && !off && !locked) openDay(d.date); }}
      className={`group flex rounded-2xl border p-3 text-right transition ${isPhone ? (off ? "flex-row items-center gap-3 !py-1.5" : "flex-row items-start gap-3") : "min-h-[150px] flex-col gap-1.5"} ${off ? "cursor-not-allowed border-dashed border-slate-200 bg-[repeating-linear-gradient(135deg,#f8fafc_0_6px,#f1f5f9_6px_12px)] opacity-70" : locked ? "cursor-not-allowed border-slate-200 bg-slate-50" : list.length ? "cursor-pointer border-[var(--sky-border)] bg-white shadow-sm hover:shadow-md" : "cursor-pointer border-[var(--border)] bg-white hover:border-[var(--sky-border)] hover:bg-[var(--sky-light)]/40"} ${d.date === today ? "ring-2 ring-[var(--navy)]/20" : ""}`}>
      <div className={`flex ${isPhone ? "w-14 shrink-0 flex-col items-center text-center" : "items-center justify-between"}`}>
        <div className={isPhone ? "" : "min-w-0"}><div className="text-[11px] font-bold text-[var(--muted)]">{d.weekday}</div><div className={`font-extrabold ${off ? "text-slate-400 line-through" : "text-[var(--navy)]"}`}>{d.label}</div></div>
        {!isPhone && (list.length > 0 ? <span className="rounded-full bg-[var(--navy)] px-2 py-0.5 text-[11px] font-bold text-white">{list.length}</span> : locked ? <span className="text-xs">🔒</span> : null)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {off ? <div className="text-[11px] font-bold text-slate-500">{d.holiday || "إجازة"}</div> : <>
          {list.slice(0, isPhone ? 6 : 4).map(it => { const doc = doctorMap.get(it.doctor_id); const isNew = newKeys.has(`${it.doctor_id}@${d.date}`); return <div key={it.doctor_id} className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[11px] ${isNew ? "border-emerald-300 bg-emerald-50" : "border-[var(--border)] bg-[var(--bg)]/60"}`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-extrabold ${classTone(doc?.classification)}`}>{doc?.classification || "–"}</span>
            <span dir="auto" title={doc?.name} className="min-w-0 flex-1 truncate text-right font-semibold">{doc?.name || "طبيب"}</span>
            {(it.priority === "high" || it.priority === "urgent") && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
            {!locked && <button type="button" onClick={e => { e.stopPropagation(); removeFromDay(d.date, it.doctor_id); }} className="shrink-0 px-0.5 text-[var(--muted)] opacity-60 hover:text-red-600 hover:opacity-100" aria-label="إزالة">×</button>}
          </div>; })}
          {list.length > (isPhone ? 6 : 4) && <div className="text-[10px] font-bold text-[var(--muted)]">+{list.length - (isPhone ? 6 : 4)} كمان</div>}
          {!list.length && !locked && <div className={`text-xs font-bold text-[var(--sky-deep,#0369a1)] ${isPhone ? "pt-2" : "pt-6 text-center"}`}>+ اختار الأطباء</div>}
          {locked && <div className="text-[10px] text-[var(--muted)]">🔒 يوم فات</div>}
        </>}
      </div>
      {isPhone && !off && list.length > 0 && <span className="rounded-full bg-[var(--navy)] px-2 py-0.5 text-[11px] font-bold text-white">{list.length}</span>}
    </div>;
  };

  const builder = <div className="space-y-3 pb-28">
    {modeBanner && <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${modeBanner.tone}`}><div><div className="font-extrabold">{modeBanner.t}</div><div className="text-xs opacity-80">{modeBanner.s}</div></div><button onClick={() => { resetBuilder(); goTab(isAdmin ? "plans" : "overview"); }} className={btnGhost}>إلغاء التعديل</button></div>}
    <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className={`${card} space-y-3 p-4`}>
          <div className="font-extrabold text-[var(--navy)]">إعداد الخطة</div>
          <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">نوع الخطة</div><div className="flex rounded-xl bg-[var(--bg)] p-1">{PLAN_PERIODS.map(p => <button key={p} type="button" disabled={!!editingPlanId} onClick={() => { setPlanPeriod(p); setItemsByDay({}); setStart(""); setEnd(""); }} className={`flex-1 rounded-lg py-2 text-sm font-bold disabled:cursor-not-allowed ${planPeriod === p ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{planPeriodLabel(p)}</button>)}</div></div>
          {isAdmin && <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">المندوب *</div><select value={adminPlanRepId} onChange={e => setAdminPlanRepId(e.target.value)} disabled={!!editingPlanId} className={field}><option value="">اختار المندوب</option>{reps.filter(r => representativeCanReceivePlan(r.active)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 2xl:grid-cols-2"><div><div className="mb-1 text-xs font-bold text-[var(--muted)]">البداية</div><input type="date" value={start} min={isAdmin ? undefined : today} onChange={e => setStart(e.target.value)} disabled={!!editingPlanId} className={field} /></div><div><div className="mb-1 text-xs font-bold text-[var(--muted)]">النهاية</div><input type="date" value={end} readOnly disabled className={field} /></div></div>
          {isAdmin && <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">هدف الزيارات</div><input type="number" min={1} value={targetVisits} onChange={e => setTargetVisits(parseInt(e.target.value || "0", 10))} className={field} /></div>}
          <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">اسم الخطة / القالب</div><input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="مثال: الخبر — الأسبوع الأول" className={field} /></div>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void suggestIQVIA()} disabled={!start} className={`${btn} border border-[var(--sky-border)] bg-[var(--sky-light)] text-[var(--navy)]`}>✨ اقتراح ذكي</button><button type="button" onClick={clearAll} disabled={!items.length} className={`${btn} border border-red-200 bg-white text-red-600`}>مسح الكل</button></div>
        </div>
        <div className={`${card} p-4`}>
          <div className="mb-2 font-extrabold text-[var(--navy)]">ملخص</div>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-xl font-extrabold text-[var(--navy)]">{items.length}</div><div className="text-[10px] text-[var(--muted)]">زيارة</div></div><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-xl font-extrabold text-[var(--navy)]">{filledDays}</div><div className="text-[10px] text-[var(--muted)]">يوم</div></div><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-xl font-extrabold text-[var(--navy)]">{filledDays ? (items.length / filledDays).toFixed(1) : "0"}</div><div className="text-[10px] text-[var(--muted)]">في اليوم</div></div></div>
          <div className="mt-2 flex gap-1.5">{(["A", "B", "C"] as const).map(c => <span key={c} className={`flex-1 rounded-lg px-2 py-1 text-center text-xs font-bold ${classTone(c)}`}>{c}: {classMix[c]}</span>)}</div>
          {isAdmin && targetVisits > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-[var(--muted)]"><span>من الهدف</span><span>{planTargetProgress(items.length, targetVisits)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--navy)]" style={{ width: `${planTargetProgress(items.length, targetVisits)}%` }} /></div></div>}
        </div>
        {!editingPlanId && templates.length > 0 && <details className={`${card} overflow-hidden`}><summary className="cursor-pointer list-none p-4 text-sm font-extrabold text-[var(--navy)]">⧉ ابدأ من قالب محفوظ ({templates.length})</summary><div className="space-y-2 border-t border-[var(--border)] p-4"><input type="date" value={templateCopyStart} onChange={e => setTemplateCopyStart(e.target.value)} className={field} /><select defaultValue="" onChange={e => { const t = templates.find(x => x.id === e.target.value); if (t) void applySavedTemplate(t); e.currentTarget.value = ""; }} className={field}><option value="">اختار قالب</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name} — {fd(t.period_start)}</option>)}</select><div className="text-[11px] text-[var(--muted)]">اختار تاريخ البداية الجديد الأول، وبعدين القالب.</div></div></details>}
      </aside>
      <div className="space-y-3">
        {!start ? <div className={`${card} flex flex-col items-center gap-2 border-dashed p-10 text-center`}><div className="text-4xl">📅</div><div className="font-extrabold text-[var(--navy)]">حدد بداية الخطة عشان يظهر التقويم</div><div className="text-sm text-[var(--muted)]">الجمعة والسبت والإجازات الرسمية بتتقفل تلقائي</div><input type="date" value={start} min={isAdmin ? undefined : today} onChange={e => setStart(e.target.value)} className={`${field} mt-2 max-w-xs`} /></div>
          : <div className={`${card} p-3 sm:p-4`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="font-extrabold text-[var(--navy)]">{editingPlanId ? "عدّل الأيام" : "وزّع الأطباء على الأيام"}</div><div className="flex items-center gap-3 text-[11px] text-[var(--muted)]"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />أولوية عالية</span>{liveDiff && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-emerald-300 bg-emerald-50" />جديد / متنقل</span>}</div></div>
            <div className={device === "phone" ? "space-y-2" : planPeriod === "daily" ? "grid grid-cols-1" : device === "tablet" ? "grid grid-cols-3 gap-2 md:grid-cols-4" : "grid gap-2"} style={device === "desktop" && planPeriod !== "daily" ? { gridTemplateColumns: planPeriod === "weekly" ? days.map(d => d.weekend || d.holiday ? "0.5fr" : "1fr").join(" ") : "repeat(7, minmax(0, 1fr))" } : undefined}>{days.map(dayCard)}</div>
          </div>}
        {liveDiff && liveCounts && <div className={`${card} p-4`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="font-extrabold text-[var(--navy)]">التغييرات عن الخطة {editMode === "admin" ? "الحالية" : "المعتمدة"}</div><CountChips c={liveCounts} /></div>
          <DiffList diff={liveDiff} name={x => x.doctor_name || docName(x.doctor_id)} />
        </div>}
        {(editMode === "rep-request" || editMode === "rep-direct") && <div className={`${card} p-4`}><div className="mb-1 font-extrabold text-[var(--navy)]">{editMode === "rep-request" ? "سبب التعديل للمدير *" : "ملاحظة للمدير (اختياري)"}</div><textarea value={changeNote} onChange={e => setChangeNote(e.target.value)} rows={3} placeholder="مثال: د. أحمد مسافر الأسبوع ده، نقلته للأسبوع الجاي وضفت د. سارة في نفس العيادة" className="w-full rounded-xl border border-[var(--border)] p-3 text-sm" /></div>}
      </div>
    </div>
    <div className={`fixed left-0 right-0 z-30 px-3 lg:right-[272px] ${device === "phone" ? "bottom-[4.75rem]" : "bottom-0 pb-3"}`}>
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/95 p-2.5 shadow-xl backdrop-blur">
        <div className="min-w-0 flex-1 px-1"><div className="truncate text-sm font-extrabold text-[var(--navy)]">{items.length} زيارة · {filledDays} يوم</div><div className="truncate text-[11px] text-[var(--muted)]">{liveCounts ? diffSummaryText(liveCounts) : start ? `${fd(start)} → ${fd(end)}` : "حدد البداية"}</div></div>
        <button type="button" disabled={saving || !items.length} onClick={() => void submitPlan()} className={`${btnPrimary} min-h-11 shrink-0 px-5`}>{saving ? "جاري الحفظ…" : editMode === "rep-request" ? "ابعت طلب التعديل للمدير" : editMode === "admin" ? "احفظ التعديلات" : editMode === "rep-direct" ? "احفظ وابعت للمراجعة" : isAdmin ? "اعمل الخطة معتمدة" : "ابعت الخطة للمدير"} <Icon name="check" size={15} /></button>
      </div>
    </div>
  </div>;

  const execGroups = Object.entries(executionRows.reduce((g: Record<string, Array<Record<string, any>>>, row) => { (g[d10(row.planned_date)] ||= []).push(row); return g; }, {})).sort(([a], [b]) => a.localeCompare(b));
  const execution = <div className="space-y-3">
    <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}><div><div className="font-extrabold text-[var(--navy)]">تنفيذ الخطط — 30 يوم</div><div className="text-xs text-[var(--muted)]">الزيارة بتتحسب منفذة لما تتسجل مكتملة أو متابعة لنفس الطبيب في نفس اليوم</div></div><div className="flex items-center gap-2">{isAdmin && <select value={viewRepId} onChange={e => setViewRepId(e.target.value)} className={`${field} w-44`}><option value="">كل المناديب</option>{reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}<button disabled={executionLoading} onClick={() => void loadExecution()} className={btnGhost}>{executionLoading ? "جاري…" : "تحديث"}</button></div></div>
    <div className="grid grid-cols-3 gap-2">{kpi("مخططة", executionSummary.planned, "زيارة")}{kpi("منفذة", executionSummary.done, executionSummary.planned ? `${Math.round(executionSummary.done / executionSummary.planned * 100)}%` : "—", "text-emerald-700")}{kpi("فائتة", executionSummary.missed, "محتاجة تعويض", "text-red-700")}</div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{execGroups.map(([day, rows]) => { const done = rows.filter(r => r.done).length; return <div key={day} className={`${card} rounded-2xl p-3`}><div className="mb-2 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">{fd(day, { weekday: "long", day: "numeric", month: "short" })}</div><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${done === rows.length ? "bg-emerald-100 text-emerald-800" : day < today ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{done}/{rows.length}</span></div><div className="space-y-1.5">{rows.map(row => <div key={String(row.id)} className={`flex items-center gap-2 rounded-xl border p-2 ${row.done ? "border-emerald-200 bg-emerald-50/60" : day < today ? "border-red-100 bg-red-50/40" : "border-[var(--border)]"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${row.done ? "bg-emerald-600 text-white" : "border bg-white"}`}>{row.done ? <Icon name="check" size={11} /> : null}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{String(row.doctor_name || "")}</div><div className="truncate text-[11px] text-[var(--muted)]">{isAdmin && row.user_name ? `${row.user_name} · ` : ""}{String(row.product_name || "بدون منتج")} · {String(row.clinic_name || "")}</div></div>{!isAdmin && !row.done && day <= today && <a href={`/visits/new?doctorId=${row.doctor_id}${row.product_id ? `&productId=${row.product_id}` : ""}`} className="text-[11px] font-bold text-[var(--navy)]">سجّل ‹</a>}</div>)}</div></div>; })}
      {!execGroups.length && !executionLoading && <div className={`${card} p-8 text-center text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3`}>مفيش زيارات مخططة في الفترة دي</div>}</div>
  </div>;

  return (
    <div className="mt-4 space-y-3 pb-20 lg:pb-0">
      <div className={`${card} flex flex-wrap items-center gap-2 p-2.5 shadow-sm`}>
        <div className="flex max-w-full overflow-x-auto rounded-xl bg-[var(--bg)] p-1">
          {tabs.map(([k, l, n]) => <button key={k} onClick={() => goTab(k)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold sm:px-4 ${tab === k ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}{n ? <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-amber-950">{n}</span> : null}</button>)}
        </div>
        <div className="mr-auto flex items-center gap-2">
          <a href="/calendar" className={`${btnGhost} hidden md:inline-flex`}>🗓️ مخطط العمل</a>
          {tab !== "builder" && <button onClick={() => { resetBuilder(); goTab("builder"); }} className={`${btnPrimary} hidden sm:inline-flex`}>+ {isAdmin ? "خطة لمندوب" : "خطة جديدة"}</button>}
          <button onClick={() => { refreshAll(); void loadIQVIA(); }} className={`${btnGhost} !px-3`} title="تحديث">⟳</button>
        </div>
      </div>

      {tab === "overview" && overview}
      {tab === "review" && (inlineReview
        ? <div className="grid grid-cols-[380px_1fr] items-start gap-3"><div className="max-h-[calc(100vh-180px)] space-y-3 overflow-auto pl-1">{reviewQueue}</div><div className={`${card} sticky top-3 min-h-[400px] p-5`}>{detailLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--bg)]" />)}</div> : detail ? renderDetail(true) : <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-[var(--muted)]"><div className="text-4xl">👈</div><div className="mt-2 font-bold">اختار خطة أو طلب من القائمة</div><div className="text-sm">هتظهر التفاصيل والمقارنة هنا</div></div>}</div></div>
        : reviewQueue)}
      {tab === "builder" && builder}
      {tab === "plans" && plansView}
      {tab === "execution" && execution}

      {detail && !inlineReview && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => setDetail(null)}>
        <div onClick={e => e.stopPropagation()} className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-[var(--bg)] shadow-2xl sm:rounded-3xl ${device === "desktop" ? "max-w-[1100px]" : "max-w-[640px]"}`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-white px-4 py-3"><div className="font-extrabold text-[var(--navy)]">تفاصيل الخطة</div><button onClick={() => setDetail(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg">×</button></div>
          <div className="overflow-auto p-4">{detailLoading ? <div className="h-40 animate-pulse rounded-2xl bg-white" /> : renderDetail()}</div>
        </div>
      </div>}

      {activeDay && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" onClick={() => setActiveDay(null)}>
        <div onClick={e => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-4">
            <div><div className="font-extrabold text-[var(--navy)]">{fd(activeDay, { weekday: "long", day: "numeric", month: "long" })}</div><div className="text-[11px] text-[var(--muted)]">{pickerSel.length} طبيب محدد</div></div>
            <div className="flex items-center gap-2"><div className="flex rounded-xl bg-[var(--bg)] p-1 text-xs font-bold"><button onClick={() => setPickerEditMode(true)} className={`rounded-lg px-3 py-1.5 ${pickerEditMode ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>اختيار</button><button onClick={() => setPickerEditMode(false)} className={`rounded-lg px-3 py-1.5 ${!pickerEditMode ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>التفاصيل ({pickerSel.length})</button></div><button onClick={() => setActiveDay(null)} className="flex h-9 w-9 items-center justify-center rounded-full border text-lg">×</button></div>
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            {pickerEditMode ? <>
              <input autoFocus={device === "desktop"} value={pickerQ} onChange={e => setPickerQ(e.target.value)} placeholder="🔎 دوّر بالاسم أو العيادة أو المدينة" className={field} />
              <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]">
                {filteredDoctors.slice(0, 150).map(d => { const sel = pickerSel.includes(d.id); return <button type="button" key={d.id} onClick={() => togglePicker(d.id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-right ${sel ? "bg-[var(--sky-light)]" : "hover:bg-[var(--bg)]"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${sel ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "bg-white"}`}>{sel ? <Icon name="check" size={12} /> : null}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{d.name}</span><span className="block truncate text-[11px] text-[var(--muted)]">{d.clinic_name} · {d.city}</span></span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${classTone(d.classification)}`}>{d.classification || "–"}</span>
                </button>; })}
                {!filteredDoctors.length && <div className="p-4 text-center text-xs text-[var(--muted)]">مفيش نتايج</div>}
              </div>
            </> : <div className="space-y-2">
              {pickerSel.map(id => { const d = doctorMap.get(id); return <div key={id} className="rounded-2xl border border-[var(--border)] p-3">
                <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${classTone(d?.classification)}`}>{d?.classification || "–"}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{d?.name}</div><div className="truncate text-[11px] text-[var(--muted)]">{d?.clinic_name} · {d?.city}</div></div><button type="button" onClick={() => togglePicker(id)} className="text-xs font-bold text-red-600">إزالة</button></div>
                <div className="mt-2 grid grid-cols-2 gap-2"><select value={pickerMeta[id]?.product_id || ""} onChange={e => setPickerMeta(m => ({ ...m, [id]: { ...(m[id] || { priority: "medium", note: "" }), product_id: e.target.value } }))} className={`${field} !h-10`}><option value="">بدون منتج</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={pickerMeta[id]?.priority || "medium"} onChange={e => setPickerMeta(m => ({ ...m, [id]: { ...(m[id] || { product_id: "", note: "" }), priority: e.target.value } }))} className={`${field} !h-10`}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>أولوية {v}</option>)}</select></div>
              </div>; })}
              {!pickerSel.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--muted)]">مفيش أطباء — ارجع لـ «اختيار»</div>}
            </div>}
          </div>
          <div className="flex gap-2 border-t border-[var(--border)] p-4"><button onClick={() => setActiveDay(null)} className={`${btnGhost} flex-1`}>إلغاء</button><button onClick={saveDay} className={`${btnPrimary} flex-1`}><Icon name="check" size={15} /> حفظ اليوم ({pickerSel.length})</button></div>
        </div>
      </div>}
    </div>
  );
}
