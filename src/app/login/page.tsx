"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const res = await fetch("/api/auth/login", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ email, password }) });
    const j = await res.json().catch(()=>null);
    setLoading(false);
    if (!res.ok) { setErr(j?.error ? (typeof j.error==="string"? j.error : "Invalid credentials") : "خطأ في تسجيل الدخول"); return; }
    router.push("/"); router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{ background:"radial-gradient(900px 500px at 100% 0%, #2b9fbd 0%, #1c4c63 48%, #15384b 100%)" }}>
      <div className="w-full max-w-[420px]">
        <div className="text-center text-white mb-6">
          <div className="text-3xl font-extrabold tracking-widest">ELITE SKIN</div>
          <div className="text-sm text-[var(--gold)] mt-1">crm.eliteskinsa.com</div>
          <h1 className="text-xl font-bold mt-4">تسجيل الدخول</h1>
          <p className="text-sm text-white/70 mt-1">نظام إدارة زيارات المناديب الطبية</p>
        </div>
        <Card className="p-6">
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
          </form>
        </Card>
      </div>
    </div>
  );
}
