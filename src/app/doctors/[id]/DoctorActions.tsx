"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { FollowupRow } from "@/components/FollowupRow";
import type { OpenFollowup } from "@/lib/followups";
import { planDays } from "@/app/plans/AreaBoard";
import { addDays, DAY_AR, weekday } from "@/lib/plan-week-core";

const FAV = "elite_doctor_favorites";
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
type Props = { doctorId: string; name: string; phone: string; clinic: string; city: string; productId: string | null; inPlan: string | null; paused: boolean; followups: OpenFollowup[]; today: string; active: boolean };

/** The rep's actions on a doctor: visit (with the right product), add to plan, follow-ups, pause, favorite, call, map. */
export default function DoctorActions(p: Props) {
  const toast = useToast(); const router = useRouter();
  const [panel, setPanel] = useState<"" | "plan" | "follow">("");
  const [fav, setFav] = useState(false); const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""); const [due, setDue] = useState(addDays(p.today, 7));
  useEffect(() => { try { setFav((JSON.parse(localStorage.getItem(FAV) || "[]") as string[]).includes(p.doctorId)); } catch { /* */ } }, [p.doctorId]);

  function toggleFav() {
    try { const l = JSON.parse(localStorage.getItem(FAV) || "[]") as string[]; const n = l.includes(p.doctorId) ? l.filter(x => x !== p.doctorId) : [...l, p.doctorId]; localStorage.setItem(FAV, JSON.stringify(n)); setFav(n.includes(p.doctorId)); } catch { /* */ }
  }
  async function plan(date: string) {
    setBusy(true); const r = await fetch("/api/agenda/plan-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, doctorId: p.doctorId, productId: p.productId || undefined }) });
    const j = await r.json().catch(() => null); setBusy(false); setPanel("");
    if (r.status === 202) toast("اتبعت طلب للمدير يوافق عليه", "info"); else if (r.ok) toast(`اتضاف لخطة ${DAY_AR[weekday(date)]} ✓`, "success"); else { toast(j?.error || "تعذر", "error"); return; }
    router.refresh();
  }
  async function pause() {
    setBusy(true); const r = await fetch("/api/doctors/pauses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doctorIds: [p.doctorId], paused: !p.paused }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر", "error"); return; }
    toast(p.paused ? "رجع للمتابعة ✓" : "اتوقف الشهر ده ✓", "success"); router.refresh();
  }
  async function addFollow() {
    if (!title.trim()) { toast("اكتب المطلوب", "error"); return; }
    setBusy(true); const r = await fetch("/api/followups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doctor_id: p.doctorId, title: title.trim(), due_at: due, product_id: p.productId || undefined }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (!r.ok) { toast(j?.error || "تعذر", "error"); return; }
    toast("اتضافت المتابعة ✓", "success"); setTitle(""); setPanel(""); router.refresh();
  }
  const btn = "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--navy)] transition hover:border-[var(--sky)]";
  const tel = p.phone.replace(/[^+\d]/g, "");
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.clinic, p.city].filter(Boolean).join(" "))}`;

  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {p.active && <Link href={`/visits/new?doctorId=${p.doctorId}${p.productId ? `&productId=${p.productId}` : ""}`} className="col-span-2 flex min-h-11 items-center justify-center rounded-xl bg-[var(--navy)] px-4 text-sm font-bold text-white sm:col-span-1">▶ سجل زيارة</Link>}
      <button type="button" onClick={() => setPanel(panel === "plan" ? "" : "plan")} className={btn}>{p.inPlan ? `✓ خطة ${dm(p.inPlan)}` : "＋ للخطة"}</button>
      <button type="button" onClick={() => setPanel(panel === "follow" ? "" : "follow")} className={btn}>↻ متابعة</button>
      {tel && <a href={`tel:${tel}`} className={btn}>📞 اتصال</a>}
      {(p.clinic || p.city) && <a href={map} target="_blank" rel="noreferrer" className={btn}>📍 الخريطة</a>}
      <button type="button" disabled={busy} onClick={() => void pause()} className={btn}>{p.paused ? "▶ رجّعه" : "⏸ وقّف الشهر ده"}</button>
      <button type="button" onClick={toggleFav} className={btn} aria-pressed={fav}>{fav ? "★ مفضّل" : "☆ مفضّل"}</button>
    </div>
    {panel === "plan" && <div className="es-pop flex flex-wrap gap-1.5 rounded-2xl bg-[var(--sky-light)] p-2.5">
      {planDays(p.today).map(d => <button key={d} type="button" disabled={busy} onClick={() => void plan(d)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[var(--navy)]">{d === p.today ? "النهارده" : d === addDays(p.today, 1) ? "بكرة" : DAY_AR[weekday(d)]} <span className="font-normal text-[var(--muted)]">{dm(d)}</span></button>)}
    </div>}
    {panel === "follow" && <div className="es-pop space-y-2 rounded-2xl bg-[var(--sky-light)] p-3">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="المطلوب (مثلاً: أرجع بالسعر الجديد)" className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-[15px]" dir="auto" />
      <div className="flex flex-wrap items-center gap-1.5">{[[1, "بكرة"], [7, "أسبوع"], [14, "أسبوعين"], [30, "شهر"]].map(([n, l]) => { const d = addDays(p.today, n as number); return <button key={n} type="button" onClick={() => setDue(d)} className={`rounded-lg px-3 py-2 text-xs font-bold ${due === d ? "bg-[var(--navy)] text-white" : "bg-white text-[var(--navy)]"}`}>{l}</button>; })}
        <input type="date" value={due} min={p.today} onChange={e => e.target.value && setDue(e.target.value)} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs" aria-label="التاريخ" />
        <button type="button" disabled={busy} onClick={() => void addFollow()} className="mr-auto min-h-9 rounded-xl bg-[var(--navy)] px-4 text-xs font-bold text-white">حفظ</button></div>
    </div>}
    {p.followups.length > 0 && <ul className="space-y-2">{p.followups.map(f => <FollowupRow key={f.source + f.id} f={f} today={p.today} onChanged={() => router.refresh()} />)}</ul>}
  </div>;
}
