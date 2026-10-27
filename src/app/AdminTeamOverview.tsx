"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge, Button } from "@/components/ui";

type Rep={id:string;name:string;email:string;active:boolean;product_name:string|null;total_visits:number;weekly_visits:number;pending_plans:number;pending_orders:number};
type Order={id:string;quantity:number;product_name:string;rep_id:string;rep_name:string;doctor_name:string;clinic_name:string;created_at:string};
type Plan={id:string;rep_id:string;rep_name:string;period_start:string;period_end:string;items_count:number};

export default function AdminTeamOverview(){
  const [data,setData]=useState<{reps:Rep[];pendingOrders:Order[];pendingPlans:Plan[]}|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  async function load(){const r=await fetch("/api/admin/overview").then(x=>x.json()).catch(()=>null);if(r)setData(r);}
  useEffect(()=>{load();},[]);
  async function decide(id:string,status:"approved"|"rejected"){
    const note=status==="rejected"?prompt("سبب الرفض (اختياري)")||"":"";
    setBusy(id); const r=await fetch(`/api/admin/orders/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status,note})});
    setBusy(null); if(!r.ok){const j=await r.json().catch(()=>null);alert(j?.error||"فشل");return;} load();
  }
  if(!data)return <Card className="p-6 text-center text-[var(--muted)]">جاري تحميل بيانات الفريق...</Card>;
  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <div className="p-4 bg-[var(--navy)] text-white flex items-center justify-between"><div><div className="font-extrabold">فريق المبيعات</div><div className="text-xs text-white/60">اضغط على اسم المندوب لفتح ملفه الكامل</div></div><Badge tone="info">{data.reps.length} مناديب</Badge></div>
      <div className="p-3 grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {data.reps.map(rep=><Link href={`/admin/rep/${rep.id}`} key={rep.id} className="rounded-2xl border border-[var(--border)] bg-white p-4 hover:border-[var(--gold)] hover:shadow-md transition">
          <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-[var(--navy)] text-[var(--gold)] flex items-center justify-center font-extrabold">{rep.name.slice(0,2)}</span><div className="min-w-0"><div className="font-extrabold text-[var(--navy)] truncate">{rep.name}</div><div className="text-xs text-[var(--muted)] truncate">{rep.product_name||"بدون منتج"}</div></div><span className={`mr-auto h-2.5 w-2.5 rounded-full ${rep.active?"bg-emerald-500":"bg-red-500"}`} /></div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-center"><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-lg font-extrabold">{rep.weekly_visits}</div><div className="text-[10px] text-[var(--muted)]">زيارات الأسبوع</div></div><div className="rounded-xl bg-[var(--bg)] p-2"><div className="text-lg font-extrabold">{rep.total_visits}</div><div className="text-[10px] text-[var(--muted)]">إجمالي الزيارات</div></div></div>
          <div className="flex gap-1 mt-2">{rep.pending_plans>0&&<Badge tone="warn">{rep.pending_plans} خطة معلقة</Badge>}{rep.pending_orders>0&&<Badge tone="danger">{rep.pending_orders} طلب موافقة</Badge>}</div>
        </Link>)}
      </div>
    </Card>
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="overflow-hidden"><div className="p-4 border-b font-extrabold flex justify-between"><span>طلبات الأوردر المعلقة</span><Badge tone={data.pendingOrders.length?"danger":"success"}>{data.pendingOrders.length}</Badge></div><div className="divide-y max-h-96 overflow-auto">{data.pendingOrders.map(o=><div key={o.id} className="p-3"><div className="flex justify-between gap-2"><div><Link href={`/admin/rep/${o.rep_id}`} className="font-bold text-[var(--navy)] hover:underline">{o.rep_name}</Link><div className="text-xs text-[var(--muted)]">{o.product_name} × {o.quantity} — {o.doctor_name} · {o.clinic_name}</div></div><div className="flex gap-1"><Button disabled={busy===o.id} onClick={()=>decide(o.id,"approved")} className="!px-2 !py-1 text-xs bg-emerald-600 !text-white">موافقة</Button><Button disabled={busy===o.id} variant="outline" onClick={()=>decide(o.id,"rejected")} className="!px-2 !py-1 text-xs text-red-700">رفض</Button></div></div></div>)}{!data.pendingOrders.length&&<div className="p-8 text-center text-sm text-[var(--muted)]">لا توجد طلبات معلقة</div>}</div></Card>
      <Card className="overflow-hidden"><div className="p-4 border-b font-extrabold flex justify-between"><span>الخطط التي تحتاج موافقة</span><Badge tone={data.pendingPlans.length?"warn":"success"}>{data.pendingPlans.length}</Badge></div><div className="divide-y max-h-96 overflow-auto">{data.pendingPlans.map(p=><Link href={`/admin/rep/${p.rep_id}`} key={p.id} className="p-3 flex justify-between hover:bg-[var(--bg)]"><div><div className="font-bold">{p.rep_name}</div><div className="text-xs text-[var(--muted)]">{new Date(p.period_start).toLocaleDateString("ar-EG")} ← {new Date(p.period_end).toLocaleDateString("ar-EG")}</div></div><Badge tone="warn">{p.items_count} زيارة</Badge></Link>)}{!data.pendingPlans.length&&<div className="p-8 text-center text-sm text-[var(--muted)]">لا توجد خطط معلقة</div>}</div></Card>
    </div>
  </div>;
}
