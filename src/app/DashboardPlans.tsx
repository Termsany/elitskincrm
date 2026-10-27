"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { groupPlanItemsByDate } from "@/lib/plan-reminders";
import Link from "next/link";

type Plan = { id:string; user_name:string; period:string; period_start:string; period_end:string; status:string; items_count:number };
type Item = { id:string; plan_id:string; planned_date:string; doctor_id:string; doctor_name:string; clinic_name:string; city:string; done:boolean };
type MissedItem = { id:string; plan_id:string; planned_date:string; doctor_id:string; doctor_name:string; clinic_name:string; city:string; period_start:string; period_end:string };
const statusLabel:Record<string,string>={approved:"معتمدة",pending:"بانتظار الموافقة",needs_revision:"تحتاج تعديل"};
const statusTone:Record<string,"success"|"warn"|"info"|"neutral">={approved:"success",pending:"warn",needs_revision:"info"};

export default function DashboardPlans({isAdmin,showToday=true}:{isAdmin:boolean;showToday?:boolean}){
  const [plans,setPlans]=useState<Plan[]>([]); const [items,setItems]=useState<Item[]>([]);
  const [today,setToday]=useState(""); const [todayItems,setTodayItems]=useState<Item[]>([]); const [missedItems,setMissedItems]=useState<MissedItem[]>([]);
  const [selected,setSelected]=useState<Plan|null>(null); const [day,setDay]=useState<string>("all");
  const [loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    const r=await fetch("/api/dashboard/plans").then(x=>x.json()).catch(()=>null);
    if(r){setPlans(r.plans||[]);setItems(r.items||[]);setToday(r.today||"");setTodayItems(r.todayItems||[]);setMissedItems(r.missedItems||[]);}
    setLoading(false);
  }
  useEffect(()=>{load();},[]);
  const selectedItems=useMemo(()=>items.filter(x=>x.plan_id===selected?.id),[items,selected]);
  const days=useMemo(()=>groupPlanItemsByDate(selectedItems),[selectedItems]);
  const visibleItems=day==="all"?selectedItems:selectedItems.filter(x=>String(x.planned_date).slice(0,10)===day);
  const visiblePlans=isAdmin?plans:plans.filter(p=>p.status==="approved"&&p.period==="weekly");
  return <>
    {!isAdmin && missedItems.length>0 && <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-extrabold text-amber-950">أطباء لم تتم زيارتهم من خطة الأسبوع</div><div className="text-xs text-amber-800 mt-1">هؤلاء الأطباء كانوا ضمن خطة أسبوع انتهت ولم تُسجّل لهم زيارة في اليوم المحدد</div></div><Badge tone="warn">{missedItems.length} طبيب</Badge></div><div className="mt-3 space-y-2">{missedItems.map(x=><div key={x.id} className="rounded-xl bg-white border border-amber-200 p-3 flex items-center gap-2"><div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{x.doctor_name}</div><div className="text-xs text-[var(--muted)] truncate">{x.clinic_name} — {x.city}</div><div className="text-[11px] text-amber-800 mt-1">موعد الخطة: {new Date(x.planned_date).toLocaleDateString("ar-EG")}</div></div><Link href={`/visits/new?doctorId=${encodeURIComponent(x.doctor_id)}`} className="shrink-0 rounded-xl bg-amber-600 text-white px-3 py-2 text-xs font-extrabold">تسجيل زيارة</Link></div>)}</div></div>}
    {!isAdmin && showToday && <div className="rounded-2xl bg-sky-50 border-2 border-sky-300 p-4 shadow-sm"><div className="font-extrabold text-sky-950">خطة اليوم — {today||"اليوم"}</div><div className="text-xs text-sky-800 mt-1">الزيارات المعتمدة المطلوبة اليوم</div><div className="mt-3 space-y-2">{todayItems.map(x=><div key={x.id} className="rounded-xl bg-white border border-sky-200 p-3 flex items-center gap-2"><div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{x.doctor_name}</div><div className="text-xs text-[var(--muted)] truncate">{x.clinic_name} — {x.city}</div></div>{x.done?<Badge tone="success">تمت الزيارة</Badge>:<Link href={`/visits/new?doctorId=${encodeURIComponent(x.doctor_id)}`} className="shrink-0 rounded-xl bg-sky-600 text-white px-3 py-2 text-xs font-extrabold">تسجيل زيارة</Link>}</div>)}{todayItems.length===0&&<div className="rounded-xl bg-white/70 border border-dashed border-sky-300 p-4 text-center text-sm text-sky-800">لا توجد زيارات معتمدة في خطة اليوم</div>}</div></div>}
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)]/50">
        <div><div className="font-extrabold text-sm">🗓 الخطط الأسبوعية المعتمدة من الإدارة</div><div className="text-xs text-[var(--muted)]">اضغط على أي خطة لعرض أيامها والأطباء داخل كل يوم</div></div>
        <a href="/plans" className="text-xs font-bold rounded-full border px-3 py-1.5 bg-white">كل الخطط</a>
      </div>
      <div className="p-3 grid md:grid-cols-2 lg:grid-cols-3 gap-2">
        {visiblePlans.map(p=><button key={p.id} onClick={()=>{setSelected(p);setDay("all");}} className="text-right rounded-xl border border-[var(--border)] bg-white hover:bg-sky-50 hover:border-sky-200 p-3 transition">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-sm">{new Date(p.period_start).toLocaleDateString("ar-EG")} ← {new Date(p.period_end).toLocaleDateString("ar-EG")}</span><Badge tone={statusTone[p.status]||"neutral"}>{statusLabel[p.status]||p.status}</Badge></div>
          <div className="text-xs text-[var(--muted)] mt-1">{isAdmin?`${p.user_name} — `:""}{p.items_count} زيارة</div>
        </button>)}
        {!loading&&visiblePlans.length===0&&<div className="col-span-full text-center text-sm text-[var(--muted)] p-6">لا توجد خطط أسبوعية معتمدة</div>}
        {loading&&<div className="col-span-full text-center text-sm text-[var(--muted)] p-4">جاري تحميل الخطط...</div>}
      </div>
    </Card>
    {selected&&<div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="p-4 border-b flex items-center justify-between"><div><div className="font-extrabold">خطة الأسبوع — {selected.user_name}</div><div className="text-xs text-[var(--muted)]">{new Date(selected.period_start).toLocaleDateString("ar-EG")} إلى {new Date(selected.period_end).toLocaleDateString("ar-EG")}</div></div><button onClick={()=>setSelected(null)} className="h-8 w-8 rounded-full border">×</button></div>
      <div className="p-3 border-b flex gap-2 overflow-auto"><Button variant={day==="all"?"primary":"outline"} onClick={()=>setDay("all")} className="shrink-0">الأسبوع كامل ({selectedItems.length})</Button>{days.map(g=><Button key={g.date} variant={day===g.date?"primary":"outline"} onClick={()=>setDay(g.date)} className="shrink-0">{new Date(g.date+"T12:00:00").toLocaleDateString("ar-EG",{weekday:"long",day:"numeric"})} ({g.items.length})</Button>)}</div>
      <div className="p-4 overflow-auto space-y-4">{(day==="all"?days:[{date:day,items:visibleItems}]).map(group=><section key={group.date} className="rounded-2xl border border-[var(--border)] overflow-hidden"><div className="bg-[var(--navy)] text-white px-4 py-2 font-extrabold text-sm">{new Date(group.date+"T12:00:00").toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"long"})}</div><div className="p-2 space-y-2">{(group.items as Item[]).map(it=><div key={it.id} className={`rounded-xl border p-3 flex items-center gap-3 ${it.done?"bg-emerald-50 border-emerald-200":"bg-white border-[var(--border)]"}`}><span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs ${it.done?"bg-emerald-600 text-white":"bg-white border"}`}>{it.done?"✓":"○"}</span><div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{it.doctor_name}</div><div className="text-xs text-[var(--muted)] truncate">{it.clinic_name} — {it.city}</div></div>{!isAdmin&&!it.done&&<Link href={`/visits/new?doctorId=${encodeURIComponent(it.doctor_id)}`} className="shrink-0 rounded-xl bg-sky-600 text-white px-3 py-2 text-xs font-bold">زيارة</Link>}</div>)}</div></section>)}</div>
    </div></div>}
  </>;
}
