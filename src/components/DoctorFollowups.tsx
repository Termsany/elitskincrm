"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Textarea } from "@/components/ui";

// Add-only form for a rep to log a new follow-up against this doctor.
// Display of existing follow-ups now lives in the doctor's unified timeline
// (DoctorTimeline), so this just refreshes the page's server data on success.
export default function DoctorFollowups({ doctorId }: { doctorId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function add() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctor_id: doctorId, title, note, due_at: due }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || "تعذر إنشاء المتابعة"); return; }
    setTitle(""); setNote(""); setDue("");
    router.refresh();
  }

  return <Card className="p-5">
    <h2 className="text-lg font-extrabold text-[var(--navy)]">إضافة متابعة جديدة</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">اربط المتابعة بالطبيب بعد الزيارة أو شرح المنتج؛ ستظهر في سجل التفاعل أعلاه.</p>
    <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[1fr_180px]">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المتابعة" />
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة أو المطلوب من المندوب" className="md:col-span-2 min-h-20" />
      <Button disabled={busy || !title.trim() || !due} onClick={() => void add()} className="md:col-span-2">{busy ? "جارٍ الإضافة..." : "إضافة متابعة"}</Button>
    </div>
    {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
  </Card>;
}
