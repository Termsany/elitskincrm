"use client";
import { useState } from "react";
import { Card, Button, Input, Label } from "@/components/ui";
export default function AccountClient({ email }: { email:string }){
  const [cur,setCur]=useState(""); const [nw,setNw]=useState(""); const [msg,setMsg]=useState<string|null>(null);
  async function submit(e:React.FormEvent){
    e.preventDefault();
    setMsg(null);
    const r=await fetch("/api/account/password",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({currentPassword:cur, newPassword:nw})});
    const j=await r.json().catch(()=>null);
    if(!r.ok){ setMsg(j?.error||"فشل"); return; }
    setMsg("تم تغيير كلمة المرور بنجاح"); setCur(""); setNw("");
  }
  return (
    <Card className="mt-4 p-5 max-w-[480px]">
      <div className="text-sm text-[var(--muted)] mb-3">البريد: <span dir="ltr">{email}</span></div>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>كلمة المرور الحالية</Label><Input type="password" value={cur} onChange={e=>setCur(e.target.value)} required /></div>
        <div><Label>كلمة المرور الجديدة</Label><Input type="password" value={nw} onChange={e=>setNw(e.target.value)} required placeholder="8+ أحرف" /></div>
        {msg && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">{msg}</div>}
        <Button type="submit" className="w-full">تغيير كلمة المرور</Button>
      </form>
      <div className="text-xs text-[var(--muted)] mt-3">نسيت كلمة المرور؟ تواصل مع الأدمن من لوحة الإدارة → المناديب → كلمة المرور</div>
    </Card>
  );
}
