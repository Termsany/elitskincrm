"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const res = await fetch("/api/auth/login", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ email, password }) });
    const j = await res.json().catch(()=>null);
    setLoading(false);
    if (!res.ok) { setErr(j?.error ? (typeof j.error==="string"? j.error : "Invalid credentials") : "خطأ في تسجيل الدخول"); return; }
    router.push("/"); router.refresh();
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const res = await fetch("/api/auth/forgot", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ email }) });
    const j = await res.json().catch(()=>null);
    setLoading(false);
    if (!res.ok) { setErr(typeof j?.error === "string" ? j.error : "تعذر إرسال الطلب"); return; }
    setSent(j?.message || "وصل الطلب للأدمن.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background:"radial-gradient(900px 480px at 50% -8%, #e3f3f0 0%, #f4f8f8 55%, #ffffff 100%)" }}>
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <Logo variant="full" tone="onLight" markSize={170} className="mb-2 h-auto w-[230px] sm:w-[260px]" />
          <h1 className="text-xl font-bold mt-4">{forgot ? "نسيت كلمة السر" : "تسجيل الدخول"}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">منصّة إدارة المبيعات والعلاقات الطبية</p>
        </div>
        <Card className="p-6">
          {forgot ? (
            sent ? (
              <div className="space-y-4 text-center">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3">{sent}</div>
                <Button type="button" variant="outline" className="w-full" onClick={()=>{ setForgot(false); setSent(null); }}>رجوع لتسجيل الدخول</Button>
              </div>
            ) : (
              <form onSubmit={onForgot} className="space-y-4">
                <p className="text-sm text-[var(--muted)]">اكتب بريدك الإلكتروني وهيوصل طلب للأدمن يعيّنلك كلمة سر جديدة.</p>
                <div className="space-y-1.5">
                  <Label>البريد الإلكتروني</Label>
                  <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@eliteskinsa.com" type="email" required autoComplete="email" />
                </div>
                {err && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{err}</div>}
                <Button type="submit" disabled={loading} className="w-full">{loading ? "جاري الإرسال..." : "إرسال الطلب"}</Button>
                <button type="button" onClick={()=>{ setForgot(false); setErr(null); }} className="block w-full text-center text-sm text-[var(--muted)] hover:underline">رجوع لتسجيل الدخول</button>
              </form>
            )
          ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@eliteskinsa.com" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور</Label>
              <Input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" required autoComplete="current-password" />
            </div>
            {err && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{err}</div>}
            <Button type="submit" disabled={loading} className="w-full">{loading ? "جاري التحميل..." : "دخول"}</Button>
            <button type="button" onClick={()=>{ setForgot(true); setErr(null); setSent(null); }} className="block w-full text-center text-sm font-semibold text-[var(--teal,#0f766e)] hover:underline">نسيت كلمة السر؟</button>
          </form>
          )}
        </Card>
      </div>
    </div>
  );
}
