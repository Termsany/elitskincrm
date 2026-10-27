import { Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { DoctorTimelineEvent } from "@/lib/doctor-timeline";

const date = (value: Date | string) => new Intl.DateTimeFormat("ar-SA", {
  timeZone: "Asia/Riyadh", calendar: "gregory", year: "numeric", month: "short", day: "numeric",
}).format(new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value));

const statuses: Record<string, string> = { completed: "مكتملة", planned: "مجدولة", cancelled: "ملغاة", follow_up: "متابعة", pending: "قيد الانتظار", in_progress: "قيد التنفيذ", failed: "لم تنجز", open: "مفتوحة" };
const priorities: Record<string, string> = { urgent: "عاجلة", high: "عالية", medium: "متوسطة", low: "منخفضة" };
const purposes: Record<string, string> = { personal_use: "استخدام شخصي", video_shooting: "تصوير فيديو", workshop: "ورشة عمل" };
const reactions: Record<string, string> = { interested: "مهتم", neutral: "محايد", not_interested: "غير مهتم" };

const typeMeta: Record<DoctorTimelineEvent["type"], { label: string; icon: string; dot: string; border: string }> = {
  visit: { label: "زيارة", icon: "visits", dot: "bg-[var(--gold)]", border: "border-[var(--gold)]" },
  followup: { label: "متابعة", icon: "calendar", dot: "bg-amber-500", border: "border-amber-500" },
  task: { label: "مهمة", icon: "tasks", dot: "bg-violet-500", border: "border-violet-500" },
  planned_visit: { label: "زيارة قادمة", icon: "plans", dot: "bg-sky-500", border: "border-sky-500" },
};

function EventBody({ event, isAdmin }: { event: DoctorTimelineEvent; isAdmin: boolean }) {
  if (event.type === "visit") {
    const v = event.data;
    return <>
      {isAdmin && v.rep_name && <div className="text-xs text-[var(--muted)]">المندوب: {v.rep_name}</div>}
      {v.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">{v.notes}</p>}
      {v.presented.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{v.presented.map((item) => <span key={item.product_id} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-900">{item.product_name} · {reactions[item.reaction] || item.reaction}</span>)}</div>}
      {v.items.length > 0 && <ul className="mt-2 space-y-1.5">{v.items.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"><span className="font-bold">{item.product_name}</span> · {item.kind === "sample" ? "عينة" : "طلب"}: {item.quantity}{item.kind === "sample" && item.sample_purpose ? ` — ${purposes[item.sample_purpose] || item.sample_purpose}` : ""}</li>)}</ul>}
      {v.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{v.attachments.map((file) => <a key={file.id} href={`/api/visits/${v.id}/attachments/${file.id}`} className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-900 hover:bg-violet-100">مرفق: {file.file_name}</a>)}</div>}
      {(v.follow_up_at || v.follow_up_note) && <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs"><b>متابعة الزيارة{v.follow_up_at ? ` · ${date(v.follow_up_at)}` : ""}</b>{v.follow_up_note && <span> — {v.follow_up_note}</span>}</div>}
    </>;
  }
  if (event.type === "followup") {
    const f = event.data;
    return <>
      {(isAdmin && f.rep_name) && <div className="text-xs text-[var(--muted)]">المندوب: {f.rep_name}{f.product_name ? ` · المنتج: ${f.product_name}` : ""}</div>}
      {!isAdmin && f.product_name && <div className="text-xs text-[var(--muted)]">المنتج: {f.product_name}</div>}
      {f.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{f.note}</p>}
    </>;
  }
  if (event.type === "task") {
    const t = event.data;
    return <Badge tone={["high", "urgent"].includes(t.priority) ? "warn" : "neutral"}>{priorities[t.priority] || t.priority}</Badge>;
  }
  const p = event.data;
  return <>
    {isAdmin && p.rep_name && <div className="text-xs text-[var(--muted)]">المندوب: {p.rep_name}</div>}
    {p.product_name && <div className="mt-1 text-sm font-semibold">المنتج: {p.product_name}</div>}
    {p.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{p.note}</p>}
  </>;
}

function eventTitle(event: DoctorTimelineEvent): string {
  if (event.type === "visit") return `زيارة · ${statuses[event.data.status] || event.data.status}`;
  if (event.type === "followup") return event.data.title;
  if (event.type === "task") return event.data.title;
  return "زيارة مخططة معتمدة";
}
function eventTone(event: DoctorTimelineEvent): "success" | "warn" | "danger" | "info" | "neutral" {
  if (event.type === "visit") return event.data.status === "completed" ? "success" : event.data.status === "cancelled" ? "danger" : "info";
  if (event.type === "followup") return event.data.status === "completed" ? "success" : event.data.status === "cancelled" ? "danger" : "warn";
  if (event.type === "task") return event.data.status === "completed" ? "success" : "neutral";
  return "info";
}
function eventStatusLabel(event: DoctorTimelineEvent): string {
  if (event.type === "visit") return statuses[event.data.status] || event.data.status;
  if (event.type === "followup" || event.type === "task") return statuses[event.data.status] || event.data.status;
  return "معتمدة";
}

export default function DoctorTimeline({ events, isAdmin }: { events: DoctorTimelineEvent[]; isAdmin: boolean }) {
  if (!events.length) return <EmptyState title="لا يوجد سجل تفاعل بعد" desc="ستظهر هنا كل الزيارات والمتابعات والمهام والزيارات القادمة الخاصة بهذا الطبيب في سجل واحد." />;
  return <ol className="mt-4 space-y-4">
    {events.map((event, index) => {
      const meta = typeMeta[event.type];
      return <li key={`${event.type}-${event.data.id}-${index}`} className={`border-r-2 ${meta.border} pr-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${meta.dot}`}><Icon name={meta.icon} size={13} /></span>
            <span className="text-xs font-bold text-[var(--muted)]">{meta.label}</span>
            <time className="text-sm font-bold text-[var(--navy)]" dateTime={event.date}>{date(event.date)}</time>
          </div>
          <Badge tone={eventTone(event)}>{eventStatusLabel(event)}</Badge>
        </div>
        <div className="mt-1 font-bold text-[var(--ink)]">{eventTitle(event)}</div>
        <div className="mt-1"><EventBody event={event} isAdmin={isAdmin} /></div>
      </li>;
    })}
  </ol>;
}
