"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { BAND, REACT, Ring, fd, secs, L } from "./viz";

type Detail = { visit: any; items: any[]; views: any[]; followups: any[]; followDone: boolean | null; previous: any[]; attachments: any[]; plan: any; review: any; day: any[] };
const Section = ({ title, icon, children, right }: { title: string; icon: string; children: React.ReactNode; right?: React.ReactNode }) =>
  <section className="rounded-2xl border border-[var(--border)] bg-white p-3.5"><div className="mb-2 flex items-center justify-between gap-2"><div className="text-sm font-extrabold text-[var(--navy)]">{icon} {title}</div>{right}</div>{children}</section>;

export default function VisitPanel({ id, onClose, onOpen, onChanged }: { id: string; onClose: () => void; onOpen: (id: string) => void; onChanged?: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null); const [err, setErr] = useState("");
  const [rating, setRating] = useState(0); const [hover, setHover] = useState(0); const [comment, setComment] = useState(""); const [saving, setSaving] = useState(false);
  const load = async () => {
    setErr("");
    const r = await fetch(`/api/admin/visits/v/${id}`, { cache: "no-store" }); const j = await r.json().catch(() => null);
    if (!r.ok || !j?.visit) { setErr(j?.error || "تعذر تحميل الزيارة"); return; }
    setD(j); setRating(j.review?.rating || 0); setComment(j.review?.comment || "");
  };
  useEffect(() => { setD(null); void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="rounded-2xl bg-red-50 p-6 text-center text-sm text-red-700">{err}</div>;
  if (!d) return <div className="space-y-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />)}</div>;
  const v = d.visit; const band = v.band ? BAND[v.band] : null;
  const red = v.flags.filter((f: any) => f.tone === "red"), amber = v.flags.filter((f: any) => f.tone === "amber");
  const maps = v.lat !== null ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : null;
  const saveReview = async () => {
    if (!rating) { toast("اختار عدد النجوم", "error"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/visits/v/${id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, comment }) });
      if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.error || "فشل", "error"); return; }
      toast("اتبعت التقييم للمندوب ✓", "success"); await load(); onChanged?.();
    } finally { setSaving(false); }
  };
  const pin = async (on: boolean) => {
    const r = await fetch(`/api/admin/visits/v/${id}/pin`, { method: on ? "POST" : "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.error || "فشل", "error"); return; }
    toast(on ? "اتثبت موقع العيادة — هيتقاس عليه كل الزيارات الجاية ✓" : "اتلغى التثبيت", "success"); await load(); onChanged?.();
  };
  const parts: Array<[string, number, number]> = [["الموقع", v.parts.location, 25], ["المحتوى", v.parts.content, 45], ["النتيجة", v.parts.outcome, 15], ["الخطة", v.parts.plan, 15]];
  const pageSec = d.views.reduce((a: Record<string, number>, x: any) => { a[x.product_name || "—"] = (a[x.product_name || "—"] || 0) + x.seconds; return a; }, {});
  return <div className="space-y-3">
    {/* Header */}
    <div className="overflow-hidden rounded-3xl bg-gradient-to-l from-[var(--navy)] to-[#0d3a40] p-4 text-white">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate text-lg font-extrabold">{v.doctor_name}</span>{v.classification && <span className="rounded-md bg-white/15 px-1.5 text-xs font-bold">{v.classification}</span>}</div>
          <div className="truncate text-xs text-white/70">{v.clinic_name}{v.city ? ` · ${v.city}` : ""}{v.specialty ? ` · ${v.specialty}` : ""}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]"><span className="rounded-full bg-white/15 px-2 py-0.5">👤 {v.rep_name}</span><span className="rounded-full bg-white/15 px-2 py-0.5">🕐 {fd(v.day, { weekday: "long", day: "numeric", month: "short" })} · {v.hm}</span>{v.status === "cancelled" && <span className="rounded-full bg-red-500 px-2 py-0.5 font-bold">ملغاة</span>}</div>
        </div>
        <div className="rounded-2xl bg-white p-1.5"><Ring value={v.score} band={v.band} size={64} stroke={6} label={band?.label} /></div>
        <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg" aria-label="إغلاق">×</button>
      </div>
      {v.score !== null && <div className="mt-3 grid grid-cols-4 gap-1.5">{parts.map(([n, s, m]) => <div key={n} className="rounded-xl bg-white/10 p-1.5 text-center"><div className="text-[10px] text-white/60">{n}</div><div className="text-sm font-extrabold">{s}<span className="text-[10px] font-normal text-white/50">/{m}</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#33b3a6]" style={{ width: `${s / m * 100}%` }} /></div></div>)}</div>}
    </div>

    {(red.length > 0 || amber.length > 0) && <div className="space-y-1.5">{red.map((f: any) => <div key={f.code} className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>🚩</span><span className="font-bold">{f.label}</span></div>)}
      {amber.length > 0 && <div className="flex flex-wrap gap-1.5">{amber.map((f: any) => <span key={f.code} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">⚠️ {f.label}</span>)}</div>}</div>}

    <Section title="الخطة" icon="🗓️">{v.planned ? <div className="text-sm"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">✓ من ضمن الخطة</span>{d.plan && <a href={`/plans?planId=${d.plan.id}`} className="mr-2 text-xs font-bold text-[var(--navy)] underline">افتح الخطة</a>}</div> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">زيارة خارج الخطة</span>}</Section>

    <Section title="المنتجات وردود الفعل" icon="💊" right={v.detail_sec ? <span className="text-[11px] font-bold text-[var(--muted)]">عرض {secs(v.detail_sec)}</span> : null}>
      {v.presented.length ? <div className="flex flex-wrap gap-1.5">{v.presented.map((p: any) => { const r = REACT[p.reaction]; return <span key={p.product_id} className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold ${r?.tone || "bg-white border-[var(--border)]"}`}>{r?.icon} {p.name}{pageSec[p.name] ? <span className="font-normal opacity-70"> · {secs(pageSec[p.name])}</span> : null}</span>; })}</div> : <div className="text-xs text-[var(--muted)]">مفيش منتجات اتسجلت</div>}
      {d.views.length > 0 && <div className="mt-3 space-y-1"><div className="text-[11px] font-bold text-[var(--muted)]">وقت كل صفحة في البروشور</div>{(() => { const max = Math.max(...d.views.map((x: any) => x.seconds), 1); return d.views.slice(0, 12).map((x: any, i: number) => <div key={i} className="flex items-center gap-2 text-[11px]"><span className="w-24 truncate">{x.product_name} · ص{x.page}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[#33b3a6]" style={{ width: `${x.seconds / max * 100}%` }} /></div><span className="w-10 text-left font-bold">{secs(x.seconds)}</span></div>); })()}</div>}
    </Section>

    {(d.items.length > 0 || v.follow_up_at || d.followups.length > 0) && <Section title="النتيجة" icon="🎯">
      {d.items.length > 0 && <div className="space-y-1">{d.items.map((x: any, i: number) => <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] px-3 py-1.5 text-xs"><span><b>{x.kind === "sample" ? "عينة" : "طلب"}</b> · {x.product_name} × {x.quantity}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${x.approval_status === "approved" ? "bg-emerald-100 text-emerald-800" : x.approval_status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{x.approval_status === "approved" ? "معتمد" : x.approval_status === "rejected" ? "مرفوض" : "مستني"}</span></div>)}</div>}
      {v.follow_up_at && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs"><span>🔁 متابعة يوم <b>{fd(v.follow_up_at)}</b>{v.follow_up_note ? ` — ${v.follow_up_note}` : ""}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.followDone ? "bg-emerald-100 text-emerald-800" : v.follow_up_at < new Date().toISOString().slice(0, 10) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{d.followDone ? "اتعملت ✓" : v.follow_up_at < new Date().toISOString().slice(0, 10) ? "فاتت" : "لسه"}</span></div>}
      {d.followups.map((x: any, i: number) => <div key={i} className="mt-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs">📌 {x.title || x.note} · {x.due_at ? fd(x.due_at) : ""} <span className="text-[var(--muted)]">({x.completed_at ? "اتعملت" : x.status})</span></div>)}
    </Section>}

    <Section title="ملاحظات المندوب" icon="📝">{v.notes?.trim() ? <p className="whitespace-pre-wrap text-sm leading-6">{v.notes}</p> : <div className="text-xs text-[var(--muted)]">مفيش ملاحظات</div>}</Section>

    <Section title="الموقع" icon="📍" right={maps ? <a href={maps} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-[var(--navy)] underline">افتح على الخريطة ↗</a> : null}>
      {v.lat === null ? <div className="text-xs text-[var(--muted)]">الزيارة اتسجلت من غير موقع</div> : <div className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-[var(--muted)]">دقة GPS</div><b className={v.accuracy_m > 100 ? "text-amber-700" : ""}>{v.accuracy_m !== null ? `${Math.round(v.accuracy_m)} م` : "—"}</b></div>
          <div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-[var(--muted)]">البعد عن العيادة</div><b className={v.distance_m > 300 ? "text-red-700" : v.distance_m !== null ? "text-emerald-700" : ""}>{v.distance_m === null ? "الموقع لسه مش معروف" : v.distance_m >= 1000 ? `${(v.distance_m / 1000).toFixed(1)} كم` : `${v.distance_m} م`}</b></div></div>
        <div className="text-[11px] text-[var(--muted)]">{v.clinic_loc ? (v.clinic_loc.source === "manual" ? "📌 موقع العيادة متثبت من المدير" : `🤖 موقع العيادة متعلّم من ${v.clinic_loc.n} زيارات موثوقة`) : "النظام هيتعلم موقع العيادة من زيارتين موثوقتين، أو ثبّته إنت من زيارة متأكد منها."}</div>
        <div className="flex gap-2">{v.clinic_loc?.source === "manual" ? <button onClick={() => void pin(false)} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold">إلغاء التثبيت</button> : null}<button onClick={() => void pin(true)} className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-[11px] font-bold text-white">📌 اعتبر ده موقع العيادة</button></div>
      </div>}
    </Section>

    {d.attachments.length > 0 && <Section title={`المرفقات (${d.attachments.length})`} icon="📎"><div className="grid grid-cols-2 gap-2">{d.attachments.map((a: any) => <a key={a.id} href={`/api/library/file/visit/${a.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2 text-xs hover:bg-[var(--bg)]">{a.mime_type?.startsWith("image/") ? <img src={`/api/library/file/visit/${a.id}`} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[10px] font-extrabold text-red-600">PDF</span>}<span className="min-w-0 flex-1 truncate font-bold" dir="auto">{a.file_name}</span></a>)}</div></Section>}

    {d.previous.length > 0 && <Section title="الزيارات السابقة للطبيب" icon="⏮️">{d.previous.map((p: any) => <button key={p.id} onClick={() => onOpen(p.id)} className="mb-1.5 block w-full rounded-xl bg-[var(--bg)] px-3 py-2 text-right text-xs hover:bg-[var(--sky-light)]"><div className="flex justify-between"><b>{new Date(p.visited_at).toLocaleDateString(L, { day: "numeric", month: "short", year: "numeric" })}</b><span className="text-[var(--muted)]">{p.rep_name}</span></div>{p.products && <div className="mt-0.5 truncate">💊 {p.products}</div>}{p.notes && <div className="mt-0.5 line-clamp-2 text-[var(--muted)]">{p.notes}</div>}</button>)}</Section>}

    {d.day.length > 1 && <Section title={`باقي يوم ${v.rep_name}`} icon="🧭"><div className="relative space-y-1 pr-3 before:absolute before:right-[5px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border)]">
      {d.day.map((x: any) => <button key={x.id} onClick={() => x.id !== id && onOpen(x.id)} className={`relative flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-right text-xs ${x.id === id ? "bg-[var(--sky-light)] font-bold" : "hover:bg-[var(--bg)]"}`}>
        <span className={`absolute -right-3 h-3 w-3 rounded-full border-2 border-white ${x.red ? "bg-red-500" : x.band ? BAND[x.band].bar : "bg-slate-300"}`} /><span className="w-10 font-mono">{x.hm}</span><span className="min-w-0 flex-1 truncate">{x.doctor_name}</span><span className="text-[10px] text-[var(--muted)]">{x.score ?? "—"}</span></button>)}
    </div></Section>}

    <Section title="تقييمك وتوجيهك للمندوب" icon="⭐">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className={`text-3xl transition hover:scale-110 ${(hover || rating) >= n ? "text-amber-400" : "text-slate-200"}`}>★</button>)}<span className="mr-2 text-xs font-bold text-[var(--muted)]">{["", "محتاجة شغل كتير", "أقل من المتوقع", "كويسة", "ممتازة", "زيارة نموذجية"][hover || rating]}</span></div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="توجيه للمندوب — مثال: كويس إنك عرضت المنتج الجديد، المرة الجاية ركّز على العينات وحدد متابعة" className="mt-2 w-full rounded-xl border border-[var(--border)] p-3 text-sm" />
      <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--muted)]">{d.review ? `آخر تقييم: ${d.review.reviewer} · ${new Date(d.review.updated_at).toLocaleDateString(L, { day: "numeric", month: "short" })}` : "هيوصل للمندوب كإشعار"}</span><button disabled={saving} onClick={() => void saveReview()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "جاري…" : d.review ? "حدّث التقييم" : "ابعت التقييم"}</button></div>
    </Section>
  </div>;
}
