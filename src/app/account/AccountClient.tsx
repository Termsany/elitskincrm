"use client";
import { useState } from "react";
import { Card, Button, Input, Label } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Settings: the signed-in user's account and password change. */
export default function AccountClient({ email }: { email: string }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [again, setAgain] = useState("");
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mismatch = again.length > 0 && again !== nw;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (nw.length < 8) { setMsg({ ok: false, text: "كلمة المرور الجديدة 8 أحرف على الأقل" }); return; }
    if (nw !== again) { setMsg({ ok: false, text: "تأكيد كلمة المرور مش مطابق" }); return; }
    if (nw === cur) { setMsg({ ok: false, text: "كلمة المرور الجديدة لازم تختلف عن الحالية" }); return; }
    setBusy(true);
    const r = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg({ ok: false, text: j?.error || "تعذر تغيير كلمة المرور" }); return; }
    setMsg({ ok: true, text: "تم تغيير كلمة المرور بنجاح" }); setCur(""); setNw(""); setAgain("");
  }
  const type = show ? "text" : "password";
  return (
    <div className="mt-4 space-y-4 max-w-[480px]">
      <Card className="p-5">
        <div className="text-sm font-extrabold text-[var(--navy)]">الحساب</div>
        <div className="mt-1 text-sm text-[var(--muted)]">البريد: <span dir="ltr">{email}</span></div>
      </Card>
      <Card className="flex items-center justify-between gap-3 p-5">
        <div><div className="text-sm font-extrabold text-[var(--navy)]">المظهر</div><div className="mt-0.5 text-xs text-[var(--muted)]">الوضع الليلي أريح للعين بالليل. الاختيار بيتحفظ على الجهاز ده.</div></div>
        <ThemeToggle className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--navy)]" />
      </Card>
      <Card className="p-5">
        <div className="mb-3 text-sm font-extrabold text-[var(--navy)]">تغيير كلمة المرور</div>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>كلمة المرور الحالية</Label><Input type={type} autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} required /></div>
          <div><Label>كلمة المرور الجديدة</Label><Input type={type} autoComplete="new-password" value={nw} onChange={e => setNw(e.target.value)} required minLength={8} placeholder="8 أحرف على الأقل" /></div>
          <div><Label>تأكيد كلمة المرور الجديدة</Label><Input type={type} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} required />
            {mismatch && <div className="mt-1 text-xs text-red-700">مش مطابقة للجديدة</div>}</div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />إظهار كلمات المرور</label>
          {msg && <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>{msg.text}</div>}
          <Button type="submit" className="w-full" disabled={busy || mismatch}>{busy ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}</Button>
        </form>
        <div className="mt-3 text-xs text-[var(--muted)]">نسيت كلمة المرور؟ تواصل مع الأدمن من لوحة الإدارة ← المناديب ← كلمة المرور</div>
      </Card>
    </div>
  );
}
