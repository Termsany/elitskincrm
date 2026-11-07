"use client";
import { useState } from "react";
import { Card, Button, Input, Label } from "@/components/ui";

type M = { id: string; name: string; email: string; active: boolean; last_login_at: string | null };

/** Sales managers: see and run all sales work (reps, visits, doctors, plans, forecast, reports) — not company accounts. */
export default function ManagersCard({ initial, canEdit }: { initial: M[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial), [open, setOpen] = useState(false);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    if (name.trim().length < 2 || !email.includes("@") || password.length < 8) { setMsg("اكتب الاسم والبريد وكلمة مرور 8 حروف على الأقل"); return; }
    setBusy(true);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), role: "sales_manager", job_title: "SALES MANAGER", assigned_product_id: null, password, active: true }) }).catch(() => null);
    const j = await r?.json().catch(() => null); setBusy(false);
    if (!r?.ok) { setMsg(typeof j?.error === "string" ? j.error : "تعذر إضافة المدير — يمكن البريد مستخدم قبل كده"); return; }
    window.location.reload();
  }
  async function toggle(m: M) {
    const r = await fetch(`/api/admin/users/${m.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !m.active }) }).catch(() => null);
    if (r?.ok) setRows(x => x.map(y => y.id === m.id ? { ...y, active: !m.active } : y)); else setMsg("تعذر تحديث الحساب");
  }
  return <Card className="p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-extrabold text-[var(--navy)]">مديرين المبيعات ({rows.filter(r => r.active).length})</div>
      <div className="mt-1 text-xs text-[var(--muted)]">بيشوفوا كل المناديب والزيارات والأطباء والخطط والفوركاست والتقارير ويعتمدوها — من غير حسابات الشركة (دفترة، الأرباح، المصروفات، الأسعار والمستخدمين).</div></div>
      {canEdit && <Button type="button" variant="outline" onClick={() => setOpen(!open)}>{open ? "إلغاء" : "+ مدير مبيعات"}</Button>}</div>
    {msg && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-2 text-sm text-red-700">{msg}</div>}
    {open && <form onSubmit={add} className="mt-3 grid gap-3 sm:grid-cols-4">
      <div><Label>الاسم</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div><Label>البريد</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" required /></div>
      <div><Label>كلمة المرور</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} dir="ltr" required autoComplete="new-password" /></div>
      <div className="flex items-end"><Button type="submit" disabled={busy}>{busy ? "جارٍ الإضافة…" : "إضافة"}</Button></div>
    </form>}
    {rows.length > 0 && <ul className="mt-3 divide-y divide-[var(--border)]">{rows.map(m => <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <b className="text-[var(--navy)]">{m.name}</b><span className="text-xs text-[var(--muted)]" dir="ltr">{m.email}</span>
      {!m.active && <span className="rounded-full bg-slate-100 px-2 text-[11px] text-slate-600">موقوف</span>}
      {canEdit && <button type="button" onClick={() => void toggle(m)} className="mr-auto text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">{m.active ? "إيقاف" : "تفعيل"}</button>}
    </li>)}</ul>}
  </Card>;
}
