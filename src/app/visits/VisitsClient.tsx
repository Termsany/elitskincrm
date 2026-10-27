"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select, Badge, Textarea, Segmented, EmptyState } from "@/components/ui";
import { buildVisitQuery, canEditVisit, getVisitStatusMeta } from "@/lib/visit-workflow";

import { REACTION_LABELS } from "@/lib/visit-entry";
type Visit = { presented?: Array<{ product_name: string; reaction: string }>; attachments:Array<{id:string;file_name:string}>; id: string; visited_at: string; notes: string; status: string; rep_name: string; doctor_name: string; clinic_name: string; city: string; items: Array<{ product_name: string; kind: string; quantity: number }>; sales_rep_id: string };

export default function VisitsClient({ isAdmin, reps, initialRepId="" }: { isAdmin: boolean; reps: Array<{ id: string; name: string }>; initialRepId?: string }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [q, setQ] = useState("");
  const [repId, setRepId] = useState(initialRepId);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Visit | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("completed");
  const router = useRouter();

  async function load(filters = { q, repId, status, from, to }) {
    const r = await fetch(`/api/visits?${buildVisitQuery(filters)}`).then((x) => x.json());
    setVisits(r.visits || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function doDelete(id: string) {
    if (!confirm("حذف الزيارة؟")) return;
    const r = await fetch(`/api/visits/${id}`, { method: "DELETE" });
    if (!r.ok) {
      alert("فشل الحذف");
      return;
    }
    setVisits(visits.filter((v) => v.id !== id));
  }
  async function saveEdit() {
    if (!editing) return;
    if (editNotes.trim().length < 10) {
      alert("الملاحظات 10 احرف على الاقل");
      return;
    }
    const r = await fetch(`/api/visits/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: editNotes, status: editStatus }) });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      alert(j?.error || "فشل الحفظ");
      return;
    }
    setEditing(null);
    load();
  }
  async function uploadFile(visitId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/visits/${visitId}/attachments`, { method: "POST", body: fd });
    if (!r.ok) {
      alert("فشل الرفع");
      return;
    }
    alert("تم الرفع");
    await load();
  }
  function exportCsv() {
    const p = new URLSearchParams();
    if (repId) p.set("repId", repId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    window.location.href = `/api/exports/visits?${p.toString()}`;
  }
  const hasActiveFilter = q || repId || status || from || to;
  function clearFilters() {
    const empty = { q: "", repId: "", status: "", from: "", to: "" };
    setQ("");
    setRepId("");
    setStatus("");
    setFrom("");
    setTo("");
    void load(empty);
  }
  function canEdit(v: Visit) {
    return canEditVisit({ isAdmin, userId: v.sales_rep_id, visit: v });
  }
  function statusMeta(statusValue: string) {
    return getVisitStatusMeta(statusValue);
  }

  return (
    <div className="space-y-4">
      {/* Filters — top polished card with segmented status */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-8 w-8 rounded-xl bg-[var(--navy)] text-[var(--gold)] flex items-center justify-center text-sm">◈</span>
          <span className="font-extrabold text-sm">فلترة الزيارات</span>
          <span className="hidden sm:inline text-[11px] text-[var(--muted)]">ابحث وفلتر ثم اضغط بحث — الحالة باختيار سريع</span>
          <span className="mr-auto hidden sm:inline-flex text-xs bg-[var(--gold-soft)] border border-[var(--gold)]/20 text-[var(--navy)] rounded-full px-3 py-1 font-bold">{visits.length} نتيجة</span>
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <Label>بحث</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="طبيب / عيادة / ملاحظات" className="pr-3" />
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>المندوب</Label>
              <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
                <option value="">الكل</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>من</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>الى</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!isAdmin && <div className="hidden md:block" />}
        </div>

        <div className="mt-4">
          <Label>الحالة</Label>
          <div className="mt-1.5">
            <Segmented
              options={[
                { value: "", label: "الكل", icon: "◎" },
                { value: "completed", label: "مكتملة", icon: "✓" },
                { value: "planned", label: "مجدولة", icon: "◷" },
                { value: "cancelled", label: "ملغاة", icon: "×" },
              ]}
              value={status}
              onChange={setStatus}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <Button onClick={() => void load()} className="px-6">
            بحث ✓
          </Button>
          <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilter}>
            مسح
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={exportCsv}>
              تصدير CSV
            </Button>
          )}
          {!isAdmin && <button type="button" onClick={() => router.push("/visits/new")} className="mr-auto rounded-xl bg-[var(--gold)] px-5 py-2.5 text-sm font-extrabold text-[var(--navy)] hover:bg-[var(--gold-2)] transition shadow-sm">
            + زيارة جديدة
          </button>}
        </div>
      </Card>

      {/* Mobile: card list */}
      <div className="grid gap-3 lg:hidden">
        {visits.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-9 w-9 rounded-xl bg-[var(--navy)] text-white flex items-center justify-center text-[11px] font-extrabold shrink-0">{v.doctor_name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm truncate">{v.doctor_name}</div>
                  <div className="text-xs text-[var(--muted)] truncate">{v.clinic_name} · {v.city}</div>
                </div>
              </div>
              <Badge tone={statusMeta(v.status).tone}>{statusMeta(v.status).icon} {statusMeta(v.status).label}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1 font-semibold">{v.rep_name}</span>
              <span className="rounded-full bg-white border border-[var(--border)] px-2.5 py-1 text-[var(--muted)]">{new Date(v.visited_at).toLocaleString("ar-EG")}</span>
            </div>
            <div className="mt-2 text-xs text-[var(--muted)] line-clamp-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5">{v.notes || "—"}</div>
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {canEdit(v) && <button onClick={() => { setEditing(v); setEditNotes(v.notes); setEditStatus(v.status); }} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50">تعديل</button>}
              {isAdmin && <button onClick={() => doDelete(v.id)} className="rounded-xl border border-red-200 text-red-700 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-50">حذف</button>}
              <label className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-slate-50">
                مرفق
                <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(v.id, e.target.files[0])} />
              </label>
              {v.presented?.map((p) => <span key={p.product_name} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs">شُرح: {p.product_name} · {REACTION_LABELS[p.reaction] ?? p.reaction}</span>)}{v.attachments?.map((a) => <a key={a.id} href={`/api/visits/${v.id}/attachments/${a.id}`} download className="rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs">{a.file_name}</a>)}
            </div>
          </Card>
        ))}
        {visits.length === 0 && (
          <Card className="overflow-hidden">
            <EmptyState icon="✦" title="لا زيارات مطابقة" desc={isAdmin ? "جرب تغيير كلمات البحث أو الفلاتر" : "جرب تغيير كلمات البحث أو الفلاتر، أو سجل زيارة جديدة"} action={!isAdmin ? <button type="button" onClick={() => router.push("/visits/new")} className="rounded-xl bg-[var(--navy)] text-white px-5 py-2.5 text-sm font-bold">+ زيارة جديدة</button> : undefined} />
          </Card>
        )}
      </div>

      {/* Desktop: polished table */}
      <Card className="overflow-hidden hidden lg:block">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]">
              <tr>
                <th className="text-right p-3 font-bold">المندوب</th>
                <th className="text-right p-3 font-bold">الطبيب / العيادة</th>
                <th className="text-right p-3 font-bold">المدينة</th>
                <th className="text-right p-3 font-bold">الحالة</th>
                <th className="text-right p-3 font-bold">التاريخ</th>
                <th className="text-right p-3 font-bold">الملاحظات</th>
                <th className="text-right p-3 font-bold">اجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="border-t border-[var(--border)] hover:bg-[var(--gold-soft)]/40 transition">
                  <td className="p-3 font-bold flex items-center gap-2">
                    <span className="h-7 w-7 rounded-full bg-[var(--navy)] text-white flex items-center justify-center text-[11px] font-extrabold shrink-0">{v.rep_name.slice(0, 2).toUpperCase()}</span>
                    {v.rep_name}
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{v.doctor_name}</span> <span className="text-[var(--muted)]">· {v.clinic_name}</span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex rounded-full bg-[var(--bg)] border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold">{v.city}</span>
                  </td>
                  <td className="p-3">
                    <Badge tone={statusMeta(v.status).tone}>{statusMeta(v.status).icon} {statusMeta(v.status).label}</Badge>
                  </td>
                  <td className="p-3 text-xs text-[var(--muted)] font-medium">{new Date(v.visited_at).toLocaleString("ar-EG")}</td>
                  <td className="p-3 max-w-[28ch] truncate text-xs text-[var(--muted)]" title={v.notes}>
                    {v.notes}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {canEdit(v) && <button onClick={() => { setEditing(v); setEditNotes(v.notes); setEditStatus(v.status); }} className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-bold hover:bg-slate-50">تعديل</button>}
                      {isAdmin && <button onClick={() => doDelete(v.id)} className="rounded-lg border border-red-200 text-red-700 bg-white px-2.5 py-1 text-xs font-bold hover:bg-red-50">حذف</button>}
                      <label className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-bold cursor-pointer hover:bg-slate-50">
                        مرفق
                        <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(v.id, e.target.files[0])} />
                      </label>
                      {v.presented?.map((p) => <span key={p.product_name} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs">شُرح: {p.product_name} · {REACTION_LABELS[p.reaction] ?? p.reaction}</span>)}{v.attachments?.map((a) => <a key={a.id} href={`/api/visits/${v.id}/attachments/${a.id}`} download className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs">{a.file_name}</a>)}
                    </div>
                  </td>
                </tr>
              ))}
              {visits.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState icon="✦" title="لا نتائج" desc="لا زيارات مطابقة للبحث الحالي" action={!isAdmin ? <button type="button" onClick={() => router.push("/visits/new")} className="text-[var(--gold)] font-extrabold text-sm">سجل زيارة ←</button> : undefined} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-[560px] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="h-8 w-8 rounded-xl bg-[var(--navy)] text-[var(--gold)] flex items-center justify-center text-xs">✎</span>
              <span className="font-extrabold">تعديل الزيارة — {editing.doctor_name}</span>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>الحالة</Label>
                <Segmented
                  options={[
                    { value: "completed", label: "مكتملة", icon: "✓" },
                    { value: "planned", label: "مجدولة", icon: "◷" },
                    { value: "cancelled", label: "ملغاة", icon: "×" },
                  ]}
                  value={editStatus}
                  onChange={setEditStatus}
                />
              </div>
              <div className="space-y-1.5">
                <Label>الملاحظات</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={4} placeholder="اكتب نتيجة الزيارة..." />
                <div className={`text-xs font-bold ${editNotes.trim().length >= 10 ? "text-emerald-700" : "text-amber-700"}`}>{editNotes.trim().length}/10 {editNotes.trim().length >= 10 ? "✓" : "مطلوب"}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setEditing(null)}>
                الغاء
              </Button>
              <Button onClick={saveEdit}>حفظ ✓</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
