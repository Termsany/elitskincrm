"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { allowedRequestTransitions, requestSlaState, requestStatusLabel, type RequestStatus } from "@/lib/request-workflow";
import { requestDueToRiyadhInput, riyadhInputToIso } from "@/lib/request-dates";

type RequestRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: RequestStatus;
  priority: string;
  category: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string;
  assigned_to: string | null;
  assigned_name: string | null;
  response: string;
  resolution_summary: string;
  urgent_reason: string;
  reference_type: string | null;
  reference_id: string | null;
  file_name: string | null;
  signed_file_name: string | null;
  event_count: number;
};

type EventRow = {
  id: string;
  event_type: string;
  visibility: "shared" | "admin";
  message: string;
  from_status: string | null;
  to_status: string | null;
  actor_name: string;
  actor_role: string | null;
  created_at: string;
};

type Assignee = { id: string; name: string };
type ViewMode = "list" | "board";

const categories: Record<string, string> = {
  general: "عام",
  hr: "موارد بشرية",
  products: "منتجات",
  documents: "مستندات",
  support: "دعم",
  doctor: "طبيب أو عيادة",
  visit: "زيارة",
  plan: "خطة",
  samples: "عينات ومواد",
};
const priorities: Record<string, string> = { low: "منخفض", normal: "عادي", high: "مرتفع", urgent: "عاجل" };
const priorityClass: Record<string, string> = {
  low: "bg-slate-50 text-slate-600 border-slate-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  urgent: "bg-red-50 text-red-800 border-red-200",
};
const statusTone = (status: string): "success" | "warn" | "danger" | "neutral" | "info" => {
  if (["completed", "closed", "approved"].includes(status)) return "success";
  if (["rejected", "cancelled"].includes(status)) return "danger";
  if (["in_progress", "reopened"].includes(status)) return "info";
  if (["pending", "needs_info", "deferred"].includes(status)) return "warn";
  return "neutral";
};
const boardColumns = [
  { key: "incoming", label: "الوارد", statuses: ["pending", "reopened"] },
  { key: "working", label: "قيد العمل", statuses: ["in_progress", "needs_info"] },
  { key: "approved", label: "القرار والتنفيذ", statuses: ["approved", "deferred"] },
  { key: "done", label: "مغلقة", statuses: ["completed", "closed", "rejected", "cancelled"] },
];

function RequestCard({ row, isAdmin, onOpen }: { row: RequestRow; isAdmin: boolean; onOpen: () => void }) {
  const sla = requestSlaState(row);
  return <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-[var(--border)] bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-md focus-visible:outline-dashed">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold text-[var(--sky-deep)]">#{row.id.slice(0, 8).toUpperCase()}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityClass[row.priority] || priorityClass.normal}`}>{priorities[row.priority] || row.priority}</span>
        </div>
        <div className="mt-2 line-clamp-2 font-extrabold text-[var(--navy)]">{row.title}</div>
        <div className="mt-1 text-xs text-[var(--muted)]">{isAdmin && row.requester_name ? `${row.requester_name} · ` : ""}{categories[row.category] || row.category}</div>
      </div>
      <Badge tone={statusTone(row.status)}>{requestStatusLabel[row.status] || row.status}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
      <span>{row.assigned_name ? `المسؤول: ${row.assigned_name}` : "غير معيّن"}</span>
      <span className={sla === "overdue" ? "font-extrabold text-red-700" : sla === "due_soon" ? "font-extrabold text-amber-700" : ""}>{sla === "overdue" ? "متأخر" : sla === "due_soon" ? "يستحق قريبًا" : new Date(row.updated_at).toLocaleDateString("ar-SA")}</span>
    </div>
  </button>;
}

export default function RequestsClient({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("active");
  const [queryText, setQueryText] = useState("");
  const [view, setView] = useState<ViewMode>(isAdmin ? "board" : "list");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState("manual_request");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [urgentReason, setUrgentReason] = useState("");
  const [referenceType, setReferenceType] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deepLinkHandled = useRef(false);
  const [adminStatus, setAdminStatus] = useState("in_progress");
  const [adminResponse, setAdminResponse] = useState("");
  const [adminResolution, setAdminResolution] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [adminPriority, setAdminPriority] = useState("normal");
  const [adminCategory, setAdminCategory] = useState("general");
  const [adminAssignee, setAdminAssignee] = useState("");
  const [adminDueAt, setAdminDueAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/requests", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.requests)) throw new Error();
      setRows(result.requests);
      setAssignees(Array.isArray(result.assignees) ? result.assignees : []);
      setSelected(current => current ? result.requests.find((row: RequestRow) => row.id === current.id) || null : null);
    } catch {
      setLoadError("تعذر تحميل مركز الطلبات. أعد المحاولة دون الاعتماد على أرقام قديمة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadActivity = useCallback(async (id: string) => {
    setActivityLoading(true);
    try {
      const response = await fetch(`/api/requests/${id}/activity`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.events)) throw new Error();
      setEvents(result.events);
    } catch {
      setEvents([]);
      setNotice("تعذر تحميل سجل الطلب");
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const openRequest = useCallback((row: RequestRow) => {
    setSelected(row);
    setComment("");
    setInternal(false);
    setAdminStatus(allowedRequestTransitions("admin", row.status)[0] || row.status);
    setAdminResponse(row.response || "");
    setAdminResolution(row.resolution_summary || "");
    setAdminNote("");
    setAdminPriority(row.priority || "normal");
    setAdminCategory(row.category || "general");
    setAdminAssignee(row.assigned_to || "");
    setAdminDueAt(requestDueToRiyadhInput(row.due_at));
    void loadActivity(row.id);
  }, [loadActivity]);

  useEffect(() => {
    if (deepLinkHandled.current || !rows.length) return;
    deepLinkHandled.current = true;
    const requestId = new URLSearchParams(window.location.search).get("request");
    const linked = requestId ? rows.find(row => row.id === requestId) : undefined;
    if (linked) openRequest(linked);
  }, [openRequest, rows]);

  const counts = useMemo(() => ({
    all: rows.length,
    action: rows.filter(row => isAdmin ? ["pending", "reopened"].includes(row.status) : row.status === "needs_info").length,
    active: rows.filter(row => ["pending", "reopened", "in_progress", "needs_info", "approved", "deferred"].includes(row.status)).length,
    overdue: rows.filter(row => requestSlaState(row) === "overdue").length,
    completed: rows.filter(row => ["completed", "closed"].includes(row.status)).length,
  }), [rows, isAdmin]);

  const visible = useMemo(() => rows.filter(row => {
    const matchesText = !queryText.trim() || `${row.title} ${row.requester_name || ""} ${categories[row.category] || ""}`.toLowerCase().includes(queryText.trim().toLowerCase());
    if (!matchesText) return false;
    if (filter === "all") return true;
    if (filter === "action") return isAdmin ? ["pending", "reopened"].includes(row.status) : row.status === "needs_info";
    if (filter === "overdue") return requestSlaState(row) === "overdue";
    if (filter === "completed") return ["completed", "closed"].includes(row.status);
    return ["pending", "reopened", "in_progress", "needs_info", "approved", "deferred"].includes(row.status);
  }), [rows, queryText, filter, isAdmin]);

  async function submitRequest() {
    if (title.trim().length < 3) { setNotice("اكتب عنوانًا واضحًا للطلب"); return; }
    if (priority === "urgent" && urgentReason.trim().length < 5) { setNotice("اكتب سبب أولوية الطلب العاجلة"); return; }
    if (kind === "document_signature" && !file) { setNotice("أرفق المستند المطلوب"); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("kind", kind); form.set("title", title); form.set("body", body);
      form.set("category", category); form.set("priority", priority); form.set("urgent_reason", urgentReason);
      if (referenceType) form.set("reference_type", referenceType);
      if (referenceId) form.set("reference_id", referenceId);
      if (file) form.set("file", file);
      const response = await fetch("/api/requests", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error || "تعذر إرسال الطلب"); return; }
      setTitle(""); setBody(""); setCategory("general"); setPriority("normal"); setUrgentReason(""); setReferenceType(""); setReferenceId(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setCreateOpen(false); setNotice("تم إرسال الطلب وسيظهر كل تحديث داخل سجله");
      await load();
    } catch { setNotice("تعذر الاتصال أثناء إرسال الطلب"); }
    finally { setBusy(false); }
  }

  async function saveAdminAction() {
    if (!selected) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("status", adminStatus); form.set("response", adminResponse); form.set("resolution_summary", adminResolution);
      form.set("admin_note", adminNote); form.set("priority", adminPriority); form.set("category", adminCategory);
      form.set("assigned_to", adminAssignee); if (adminDueAt) form.set("due_at", riyadhInputToIso(adminDueAt));
      const response = await fetch(`/api/requests/${selected.id}`, { method: "PATCH", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error || "تعذر تحديث الطلب"); return; }
      setNotice("تم تحديث الطلب وإبلاغ المندوب"); setAdminNote("");
      await load(); await loadActivity(selected.id);
    } catch { setNotice("تعذر الاتصال أثناء تحديث الطلب"); }
    finally { setBusy(false); }
  }

  async function addComment(action: "reopen" | "close" | null = null) {
    if (!selected || comment.trim().length < 2) { setNotice("اكتب تعليقًا واضحًا"); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/requests/${selected.id}/activity`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: comment, visibility: internal ? "admin" : "shared", reopen: action === "reopen", close: action === "close" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error || "تعذر إضافة التعليق"); return; }
      setComment(""); setInternal(false); setNotice(action === "reopen" ? "تمت إعادة فتح الطلب" : action === "close" ? "تم تأكيد إغلاق الطلب" : "تمت إضافة التحديث");
      await load(); await loadActivity(selected.id);
    } catch { setNotice("تعذر الاتصال أثناء إضافة التحديث"); }
    finally { setBusy(false); }
  }

  async function cancelRequest() {
    if (!selected || !window.confirm(`إلغاء الطلب «${selected.title}»؟`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/requests/${selected.id}/cancel`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(result.error || "تعذر إلغاء الطلب"); return; }
      setNotice("تم إلغاء الطلب"); setSelected(null); await load();
    } catch { setNotice("تعذر الاتصال أثناء إلغاء الطلب"); }
    finally { setBusy(false); }
  }

  return <div className="mt-5 space-y-5">
    {notice && <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><span>{notice}</span><button type="button" onClick={() => setNotice("")} className="h-8 w-8 rounded-full border border-sky-200">×</button></div>}
    {loadError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}<Button variant="outline" className="mr-3" onClick={() => void load()}>إعادة المحاولة</Button></div>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[
        ["الطلبات النشطة", counts.active, "active", "◷"],
        [isAdmin ? "تحتاج قرارًا" : "تحتاج ردك", counts.action, "action", "!"],
        ["متأخرة", counts.overdue, "overdue", "⚠"],
        ["مكتملة", counts.completed, "completed", "✓"],
        ["الإجمالي", counts.all, "all", "▦"],
      ].map(([label, value, key, icon]) => <button type="button" key={String(key)} onClick={() => setFilter(String(key))} className={`min-h-24 rounded-2xl border p-4 text-right shadow-sm transition ${filter === key ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white hover:border-[var(--gold)]"}`}><div className="flex items-center justify-between text-xs font-bold opacity-75"><span>{label}</span><span>{icon}</span></div><div className={`mt-2 text-3xl font-extrabold ${filter === key ? "text-[var(--gold)]" : "text-[var(--navy)]"}`}>{value}</div></button>)}
    </div>

    <Card className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1"><Input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="ابحث برقم الطلب أو العنوان أو المندوب…" /></div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <><Button variant={view === "board" ? "primary" : "outline"} onClick={() => setView("board")}>عرض المراحل</Button><Button variant={view === "list" ? "primary" : "outline"} onClick={() => setView("list")}>قائمة</Button></>}
          {!isAdmin && <Button onClick={() => setCreateOpen(true)} className="min-h-11">+ طلب جديد</Button>}
        </div>
      </div>
    </Card>

    {loading ? <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}</div> : view === "board" && isAdmin ?
      <div className="grid gap-4 xl:grid-cols-4">{boardColumns.map(column => { const items = visible.filter(row => column.statuses.includes(row.status)); return <section key={column.key} className="rounded-3xl border border-[var(--border)] bg-slate-50/70 p-3"><div className="mb-3 flex items-center justify-between px-1"><h2 className="font-extrabold text-[var(--navy)]">{column.label}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[var(--muted)] shadow-sm">{items.length}</span></div><div className="space-y-3">{items.map(row => <RequestCard key={row.id} row={row} isAdmin onOpen={() => openRequest(row)} />)}{!items.length && <div className="rounded-2xl border border-dashed bg-white p-5 text-center text-xs text-[var(--muted)]">لا توجد طلبات</div>}</div></section>; })}</div>
      : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(row => <RequestCard key={row.id} row={row} isAdmin={isAdmin} onOpen={() => openRequest(row)} />)}{!visible.length && <Card className="p-10 text-center text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3">لا توجد طلبات مطابقة للفلاتر الحالية</Card>}</div>}

    {createOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label="إنشاء طلب جديد"><div className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><div><div className="text-xl font-extrabold text-[var(--navy)]">طلب جديد</div><div className="text-xs text-[var(--muted)]">سيظهر لك المسؤول والموعد وكل تحديث داخل سجل واحد.</div></div><button type="button" onClick={() => setCreateOpen(false)} className="h-11 w-11 rounded-full border text-xl">×</button></div><div className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2"><div><Label>نوع الطلب</Label><Select value={kind} onChange={event => setKind(event.target.value)}><option value="manual_request">طلب إداري أو تشغيلي</option><option value="document_signature">طلب مستند</option></Select></div><div><Label>التصنيف</Label><Select value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div></div>
      <div><Label required>عنوان واضح للطلب</Label><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="مثال: توفير عينات للزيارة القادمة" /></div>
      <div><Label>التفاصيل والنتيجة المطلوبة</Label><Textarea value={body} onChange={event => setBody(event.target.value)} rows={5} maxLength={5000} placeholder="اشرح المطلوب وما الذي تعتبره نتيجة مكتملة…" /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label>الأولوية</Label><Select value={priority} onChange={event => setPriority(event.target.value)}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div><div><Label>ربط بسجل موجود</Label><Select value={referenceType} onChange={event => setReferenceType(event.target.value)}><option value="">بدون ربط</option><option value="doctor">طبيب</option><option value="visit">زيارة</option><option value="plan">خطة</option><option value="product">منتج</option><option value="task">مهمة</option></Select></div></div>
      {referenceType && <div><Label>معرّف السجل المرتبط</Label><Input value={referenceId} onChange={event => setReferenceId(event.target.value)} placeholder="الصق معرّف السجل من النظام" /></div>}
      {priority === "urgent" && <div><Label required>سبب الاستعجال</Label><Textarea value={urgentReason} onChange={event => setUrgentReason(event.target.value)} rows={2} placeholder="لماذا يجب معالجة هذا الطلب خلال 24 ساعة؟" /></div>}
      {kind === "document_signature" && <div><Label required>المستند</Label><input ref={fileRef} type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border p-3 text-sm" /><div className="mt-1 text-xs text-[var(--muted)]">الحد الأقصى 15 ميجابايت، والملف يبقى محميًا داخل النظام.</div></div>}
      <div className="flex gap-2"><Button onClick={() => void submitRequest()} disabled={busy} className="min-h-12 flex-1">{busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button></div>
    </div></div></div>}

    {selected && <div className="fixed inset-0 z-[80] bg-black/55" role="dialog" aria-modal="true" aria-label="تفاصيل الطلب"><button type="button" aria-label="إغلاق" onClick={() => setSelected(null)} className="absolute inset-0" /><aside className="absolute inset-y-0 left-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl"><header className="flex items-start justify-between gap-3 border-b p-4 sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold text-[var(--sky-deep)]">#{selected.id.slice(0, 8).toUpperCase()}</span><Badge tone={statusTone(selected.status)}>{requestStatusLabel[selected.status] || selected.status}</Badge><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityClass[selected.priority]}`}>{priorities[selected.priority]}</span></div><h2 className="mt-2 text-xl font-extrabold text-[var(--navy)]">{selected.title}</h2><div className="mt-1 text-xs text-[var(--muted)]">{isAdmin && selected.requester_name ? `${selected.requester_name} · ` : ""}{categories[selected.category]} · آخر تحديث {new Date(selected.updated_at).toLocaleString("ar-SA")}</div></div><button type="button" onClick={() => setSelected(null)} className="h-11 w-11 shrink-0 rounded-full border text-xl">×</button></header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-5"><div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]"><div className="space-y-4">
        <Card className="p-4"><div className="text-xs font-bold text-[var(--muted)]">تفاصيل الطلب</div><div className="mt-2 whitespace-pre-wrap text-sm leading-7">{selected.body || "لا توجد تفاصيل إضافية"}</div>{selected.urgent_reason && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>سبب الاستعجال:</b> {selected.urgent_reason}</div>}<div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><span className="text-[var(--muted)]">المسؤول</span><div className="mt-1 font-bold">{selected.assigned_name || "لم يُعيّن"}</div></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-[var(--muted)]">الموعد</span><div className="mt-1 font-bold">{selected.due_at ? new Date(selected.due_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "غير محدد"}</div></div></div>{selected.file_name && <a href={`/api/requests/${selected.id}?kind=original`} className="mt-3 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold text-sky-700">تنزيل المرفق الأصلي</a>}{selected.signed_file_name && <a href={`/api/requests/${selected.id}?kind=signed`} className="mr-2 mt-3 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold text-emerald-700">تنزيل ملف الإنجاز</a>}</Card>
        {isAdmin && !["cancelled", "closed", "rejected", "completed"].includes(selected.status) && <Card className="p-4"><div className="font-extrabold text-[var(--navy)]">قرار وإدارة الطلب</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label>الحالة التالية</Label><Select value={adminStatus} onChange={event => setAdminStatus(event.target.value)}>{allowedRequestTransitions("admin", selected.status).map(status => <option key={status} value={status}>{requestStatusLabel[status]}</option>)}</Select></div><div><Label>المسؤول</Label><Select value={adminAssignee} onChange={event => setAdminAssignee(event.target.value)}><option value="">غير معيّن</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></div><div><Label>الأولوية</Label><Select value={adminPriority} onChange={event => setAdminPriority(event.target.value)}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div><div><Label>التصنيف</Label><Select value={adminCategory} onChange={event => setAdminCategory(event.target.value)}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div><div><Label>موعد الإنجاز</Label><Input type="datetime-local" value={adminDueAt} onChange={event => setAdminDueAt(event.target.value)} /></div></div><div className="mt-3"><Label>الرد الظاهر للمندوب</Label><Textarea value={adminResponse} onChange={event => setAdminResponse(event.target.value)} rows={3} placeholder="اكتب القرار أو المعلومات المطلوبة…" /></div><div className="mt-3"><Label>ملخص التنفيذ</Label><Textarea value={adminResolution} onChange={event => setAdminResolution(event.target.value)} rows={2} placeholder="مطلوب عند الإكمال أو الإغلاق" /></div><div className="mt-3"><Label>ملاحظة داخلية للإدارة</Label><Textarea value={adminNote} onChange={event => setAdminNote(event.target.value)} rows={2} placeholder="لا تظهر للمندوب" /></div><Button onClick={() => void saveAdminAction()} disabled={busy} className="mt-3 min-h-12 w-full">{busy ? "جارٍ الحفظ…" : "حفظ وإبلاغ المندوب"}</Button></Card>}
        {!isAdmin && ["pending", "in_progress", "needs_info"].includes(selected.status) && <Button variant="outline" disabled={busy} onClick={() => void cancelRequest()} className="min-h-11 text-red-700">إلغاء الطلب</Button>}
      </div><div className="space-y-4"><Card className="p-4"><div className="flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">سجل الطلب</div><span className="text-xs text-[var(--muted)]">{events.length} تحديث</span></div><div className="mt-4 space-y-0">{activityLoading ? <div className="text-sm text-[var(--muted)]">جارٍ تحميل السجل…</div> : events.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-5"><div className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-[var(--gold)] ring-4 ring-[var(--gold-soft)]" />{index < events.length - 1 && <div className="absolute right-[5px] top-4 h-full w-px bg-[var(--border)]" />}<div className={`min-w-0 flex-1 rounded-xl p-3 ${event.visibility === "admin" ? "border border-violet-200 bg-violet-50" : "bg-slate-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold">{event.actor_name}{event.visibility === "admin" ? " · داخلي" : ""}</span><span className="text-[10px] text-[var(--muted)]">{new Date(event.created_at).toLocaleString("ar-SA")}</span></div><div className="mt-1 whitespace-pre-wrap text-sm leading-6">{event.message}</div>{event.from_status && event.to_status && event.from_status !== event.to_status && <div className="mt-2 text-[10px] text-[var(--muted)]">{requestStatusLabel[event.from_status as RequestStatus] || event.from_status} ← {requestStatusLabel[event.to_status as RequestStatus] || event.to_status}</div>}</div></div>)}{!activityLoading && !events.length && <div className="text-sm text-[var(--muted)]">لا توجد تحديثات بعد.</div>}</div></Card>
        {!['cancelled', 'closed', 'rejected'].includes(selected.status) && <Card className="p-4"><div className="font-extrabold text-[var(--navy)]">إضافة تحديث</div><Textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} maxLength={2000} className="mt-3" placeholder={selected.status === "needs_info" && !isAdmin ? "أرسل المعلومات المطلوبة لإعادة الطلب إلى المراجعة…" : selected.status === "completed" && !isAdmin ? "اكتب ملاحظة الإغلاق أو سبب إعادة الفتح…" : "اكتب تعليقًا أو تحديثًا…"} />{isAdmin && <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={internal} onChange={event => setInternal(event.target.checked)} /> ملاحظة داخلية لا تظهر للمندوب</label>}<div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void addComment(null)} className="min-h-11 flex-1">إضافة التحديث</Button>{!isAdmin && selected.status === "completed" && <><Button disabled={busy} onClick={() => void addComment("close")} className="min-h-11 bg-emerald-600 !text-white">تأكيد الإغلاق</Button><Button variant="outline" disabled={busy} onClick={() => void addComment("reopen")} className="min-h-11">إعادة فتح الطلب</Button></>}</div></Card>}
      </div></div></div>
    </aside></div>}
  </div>;
}
