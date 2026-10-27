"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notificationHref } from "@/lib/notification-links";
type N = { id:string; message:string; kind:string; is_read:boolean; created_at:string; task_id:string|null; task_title:string|null; plan_title:string|null; plan_id:string|null; action_url:string|null };
export default function NotificationsBell({role="sales_rep"}:{role?:string}){
  const router = useRouter();
  const [list,setList]=useState<N[]>([]); const [unread,setUnread]=useState(0); const [open,setOpen]=useState(false);
  const [hasNew,setHasNew]=useState(false);
  const load=useCallback(async()=>{
    const r=await fetch("/api/notifications").then(x=>x.json()).catch(()=>null);
    if(r){
      const newCount=r.unread||0;
      setUnread(previous=>{ if(newCount>previous) setHasNew(true); return newCount; });
      setList(r.notifications||[]);
    }
  },[]);
  useEffect(()=>{ load(); const id=setInterval(load, 30*1000); return ()=> clearInterval(id); },[load]);
  useEffect(()=>{ if(hasNew) { const t=setTimeout(()=> setHasNew(false), 2000); return ()=> clearTimeout(t); } },[hasNew]);
  async function markAll(){ const response=await fetch("/api/notifications",{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({all:true})}); if(response.ok)setUnread(0); await load(); }

  async function openNotification(n:N){
    if(!n.is_read){ const response=await fetch("/api/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:n.id})}); if(response.ok){setUnread(Math.max(0,unread-1));setList(list.map(x=>x.id===n.id?{...x,is_read:true}:x));} }
    setOpen(false); router.push(notificationHref(n, role));
  }
  return (
    <div className="relative">
      <button onClick={()=>setOpen(!open)} className={`relative flex items-center justify-center h-11 w-11 rounded-2xl border-2 shadow-md transition ${unread>0? "bg-[var(--navy)] border-[var(--gold)] text-white animate-pulse":"bg-white border-[var(--border)] text-[var(--navy)] hover:border-[var(--gold)]"} ${hasNew? "scale-110":""}`} title="الإشعارات" aria-label="الإشعارات">
        <span className="text-lg">🔔</span>
        {unread>0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[11px] font-extrabold rounded-full h-6 min-w-6 flex items-center justify-center px-1 border-2 border-white shadow">{unread>99? "99+": unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={()=>setOpen(false)} />
          <div className="absolute left-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl bg-white border border-[var(--border)] shadow-2xl z-50 overflow-hidden">
            <div className="p-3 flex items-center justify-between border-b border-[var(--border)] bg-[var(--navy)] text-white">
              <span className="font-bold text-sm flex items-center gap-2">🔔 الإشعارات {unread>0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unread} جديد</span>}</span>
              <button onClick={markAll} className="text-xs bg-white/15 hover:bg-white/20 rounded-full px-2 py-1 font-bold">تعليم الكل مقروء</button>
            </div>
            <div className="max-h-[50vh] overflow-auto divide-y divide-[var(--border)]">
              {list.map(n=>(
                <button type="button" key={n.id} onClick={()=>openNotification(n)} className={`w-full text-right p-3 text-sm hover:bg-sky-50 transition cursor-pointer ${!n.is_read? "bg-amber-50 border-r-4 border-amber-400":""}`}>
                  <div className="font-semibold">{n.message}</div>
                  {(n.task_title||n.plan_title) && <div className="text-xs text-[var(--muted)]">{n.task_title||n.plan_title}</div>}
                  <div className="text-[11px] text-[var(--muted)] mt-1">{new Date(n.created_at).toLocaleString("ar-EG")} — {n.kind} · اضغط للفتح</div>
                </button>
              ))}
              {list.length===0 && <div className="p-8 text-center text-sm text-[var(--muted)]">لا إشعارات حاليا<br/><span className="text-xs">ستظهر هنا عند إسناد مهمة أو اكتمالها</span></div>}
            </div>
            <Link href={list.some(n=>n.plan_id)?"/plans":"/tasks"} onClick={()=>setOpen(false)} className="block text-center text-xs font-bold text-[var(--navy)] py-3 border-t border-[var(--border)] bg-[var(--gold-soft)] hover:bg-[var(--bg)]">عرض التفاصيل →</Link>
          </div>
        </>
      )}
    </div>
  );
}
