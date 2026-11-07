"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Form = { name: string; clinic_name: string; city: string; specialty: string; classification: string; phone: string; email: string };
type R = { id: string; kind: string; status: string; payload: Form; requester_id: string; requester_name: string; doctor_id: string | null; doctor_name: string | null; admin_note: string; created_at: string };
type Tab = "pending" | "approved" | "rejected" | "all";
const empty: Form = { name: "", clinic_name: "", city: "", specialty: "", classification: "", phone: "", email: "" };
const fields: Array<[keyof Form, string]> = [["name", "اسم الطبيب"], ["clinic_name", "اسم العيادة"], ["city", "المدينة / المنطقة"], ["specialty", "التخصص"], ["phone", "الجوال"], ["email", "البريد الإلكتروني"]];
const PAGE = 12;
const day = (d: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));
const STATUS: Record<string, [string, string]> = {
  pending: ["مستني", "bg-amber-50 text-amber-800 ring-amber-200"], approved: ["اتقبل", "bg-emerald-50 text-emerald-700 ring-emerald-200"], rejected: ["اترفض", "bg-red-50 text-red-700 ring-red-200"],
};
const Pill = ({ s }: { s: string }) => { const [l, c] = STATUS[s] || [s, "bg-slate-100 text-slate-600 ring-slate-200"]; return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${c}`}>{l}</span>; };
const Kind = ({ k }: { k: string }) => <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${k === "create" ? "bg-sky-50 text-sky-800" : "bg-violet-50 text-violet-800"}`}>{k === "create" ? "＋ جديد" : "✎ تعديل"}</span>;

/** Doctor add / edit requests: pending ones as compact action cards, decided ones as one-line rows that expand. */
export default function DoctorRequestsClient() {
  const toast = useToast();
  const [rows, setRows] = useState<R[]>([]); const [busy, setBusy] = useState(""); const [note, setNote] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<R | null>(null); const [form, setForm] = useState<Form>(empty); const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("pending"); const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(null); const [limit, setLimit] = useState(PAGE);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  async function load() { const r = await fetch("/api/doctor-requests", { cache: "no-store" }); const j = await r.json(); setRows(j.requests || []); }
  useEffect(() => { void load(); }, []);
  const counts = useMemo(() => ({ pending: rows.filter(r => r.status === "pending").length, approved: rows.filter(r => r.status === "approved").length, rejected: rows.filter(r => r.status === "rejected").length, all: rows.length }), [rows]);
  useEffect(() => { if (rows.length && !counts.pending && tab === "pending") setTab("all"); }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => rows.filter(r => (tab === "all" || r.status === tab) && (!q.trim() || `${r.payload?.name} ${r.payload?.clinic_name} ${r.payload?.city} ${r.requester_name} ${r.doctor_name || ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, tab, q]);

  const setField = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }));
  function openEdit(r: R) { setEditing(r); setForm({ ...empty, ...(r.payload || {}) }); setMessage(""); }
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); const r = await fetch(`/api/doctor-requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null); setBusy(""); return r.ok ? null : (j?.error || "تعذر الحفظ");
  }
  async function save(status?: "approved" | "rejected") {
    if (!editing) return; setMessage("");
    const e = await patch(editing.id, { status, payload: form, admin_note: note[editing.id] || "" });
    if (e) { setMessage(e); return; } setEditing(null); await load();
  }
  async function approveDirect(r: R) { const e = await patch(r.id, { status: "approved", payload: r.payload, admin_note: note[r.id] || "" }); if (e) toast(e, "error"); else { toast(`اتضاف ${r.payload?.name || "الطبيب"} ✓`, "success"); await load(); } }
  async function reject(id: string) { const e = await patch(id, { status: "rejected", admin_note: note[id] || "" }); if (e) toast(e, "error"); else { setNoteFor(null); setEditing(null); toast("اترفض الطلب", "success"); await load(); } }

  const facts = (p: Form) => [p.clinic_name, p.city, p.specialty, p.classification ? `Class ${p.classification}` : "", p.phone].filter(Boolean);

  return <Card className="mt-5 overflow-hidden p-0">
    <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
      <div><div className="text-lg font-extrabold text-[var(--navy)]">طلبات الأطباء والعيادات</div><div className="text-xs text-[var(--muted)]">إضافة طبيب جديد أو تعديل بياناته — وافق بضغطة أو عدّل قبل الموافقة</div></div>
      <input value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="بحث بالاسم أو العيادة أو المندوب" className="min-w-0 rounded-xl border border-[var(--border)] px-3 py-2 text-sm sm:w-64" />
    </div>
    <div className="flex gap-1.5 overflow-x-auto border-y border-[var(--border)] bg-[var(--bg)] px-4 py-2">{([["pending", "مستنية"], ["approved", "اتقبلت"], ["rejected", "اترفضت"], ["all", "الكل"]] as Array<[Tab, string]>).map(([t, l]) =>
      <button key={t} type="button" onClick={() => { setTab(t); setLimit(PAGE); setOpen(null); }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === t ? "bg-[var(--navy)] text-white shadow" : "bg-white text-[var(--muted)] hover:text-[var(--navy)]"}`}>
        {l} <span className={`mr-1 rounded-full px-1.5 text-[10px] ${tab === t ? "bg-white/20" : t === "pending" && counts.pending ? "bg-amber-100 text-amber-800" : "bg-[var(--bg)]"}`}>{counts[t]}</span></button>)}</div>

    <div className="divide-y divide-[var(--border)]">
      {shown.slice(0, limit).map(r => { const p = r.payload || empty, pending = r.status === "pending", isOpen = open === r.id;
        if (pending) return <div key={r.id} className="bg-amber-50/30 p-3 sm:px-4">
          <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5"><Kind k={r.kind} /><b className="text-sm text-[var(--ink)]">{p.name || r.doctor_name || "—"}</b>{r.kind !== "create" && r.doctor_name && r.doctor_name !== p.name && <span className="text-[11px] text-[var(--muted)]">(كان: {r.doctor_name})</span>}</div>
              <div className="mt-0.5 truncate text-[12px] text-[var(--ink-soft)]" title={facts(p).join(" · ")}>{facts(p).join(" · ") || "—"}</div>
              <div className="text-[11px] text-[var(--muted)]">{r.requester_name} · {day(r.created_at)}</div>
            </div>
            <div className="flex w-full shrink-0 gap-1.5 sm:w-auto">
              <button type="button" disabled={busy === r.id} onClick={() => void approveDirect(r)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 sm:flex-none">✓ موافقة</button>
              <button type="button" disabled={busy === r.id} onClick={() => openEdit(r)} className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold sm:flex-none">✎ عدّل</button>
              <button type="button" disabled={busy === r.id} onClick={() => setNoteFor(noteFor === r.id ? null : r.id)} className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 sm:flex-none">✕ رفض</button>
            </div>
          </div>
          {noteFor === r.id && <div className="mt-2 flex gap-1.5"><Input autoFocus value={note[r.id] || ""} onChange={e => setNote({ ...note, [r.id]: e.target.value })} placeholder="سبب الرفض للمندوب (اختياري)" className="!py-1.5 text-sm" />
            <button type="button" disabled={busy === r.id} onClick={() => void reject(r.id)} className="shrink-0 rounded-lg bg-red-600 px-3 text-xs font-bold text-white">تأكيد</button></div>}
        </div>;
        return <div key={r.id}>
          <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-sm transition hover:bg-[var(--sky-light)]/50 sm:px-4">
            <Kind k={r.kind} /><b className="min-w-0 truncate text-[var(--ink)]" dir="auto">{p.name || r.doctor_name || "—"}</b>
            <span className="hidden min-w-0 flex-1 truncate text-[12px] text-[var(--muted)] sm:block">{[p.clinic_name, p.city].filter(Boolean).join(" · ")}</span>
            <span className="mr-auto shrink-0 text-[11px] text-[var(--muted)] sm:mr-0">{r.requester_name.split(" ")[0]} · {day(r.created_at)}</span>
            <Pill s={r.status} /><span className="shrink-0 text-[10px] text-[var(--muted)]">{isOpen ? "▴" : "▾"}</span>
          </button>
          {isOpen && <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-[var(--bg)] px-4 py-2.5 text-[12px] sm:grid-cols-4">{([["العيادة", p.clinic_name], ["المدينة", p.city], ["التخصص", p.specialty], ["Class", p.classification], ["الجوال", p.phone], ["البريد", p.email]] as Array<[string, string]>).map(([l, v]) =>
            <div key={l} className="min-w-0"><span className="text-[var(--muted)]">{l}: </span><b className="break-words" dir="auto">{v || "—"}</b></div>)}
            {r.admin_note && <div className="col-span-full text-[var(--muted)]">ملاحظة: {r.admin_note}</div>}</div>}
        </div>;
      })}
      {!shown.length && <div className="p-8 text-center text-sm text-[var(--muted)]">{tab === "pending" ? "مفيش طلبات مستنية ✓" : "مفيش طلبات"}</div>}
    </div>
    {shown.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE)} className="w-full border-t border-[var(--border)] py-2.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">عرض {Math.min(PAGE, shown.length - limit)} كمان من {shown.length - limit}</button>}

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div className="w-full max-w-2xl"><Card className="max-h-[90vh] overflow-auto p-5">
      <div className="mb-4 flex items-center justify-between"><div><div className="text-lg font-extrabold">مراجعة طلب الطبيب</div><div className="text-xs text-[var(--muted)]">عدّل البيانات قبل اعتمادها لو محتاج.</div></div><button className="h-8 w-8 rounded-full border" onClick={() => setEditing(null)}>×</button></div>
      <div className="grid gap-3 md:grid-cols-2">{fields.map(([k, l]) => <div key={k}><Label>{l}</Label><Input type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} value={form[k]} onChange={e => setField(k, e.target.value)} /></div>)}
        <div><Label>التصنيف</Label><Select value={form.classification} onChange={e => setField("classification", e.target.value)}><option value="">بدون تصنيف</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></Select></div>
        <div className="md:col-span-2"><Label>ملاحظة للمندوب</Label><Input value={note[editing.id] || ""} onChange={e => setNote({ ...note, [editing.id]: e.target.value })} placeholder="اختياري" /></div></div>
      {message && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</div>}
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy === editing.id} onClick={() => void save("approved")} className="bg-emerald-600 !text-white">حفظ والموافقة</Button><Button disabled={busy === editing.id} variant="outline" onClick={() => void save()}>حفظ التعديل بس</Button><Button disabled={busy === editing.id} variant="outline" onClick={() => void reject(editing.id)} className="text-red-700">رفض الطلب</Button></div>
    </Card></div></div>}
  </Card>;
}
