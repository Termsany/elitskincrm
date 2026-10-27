"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
export default function MyAlertsBadge({ role }: { role: string }){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    if(role==="admin") return;
    fetch("/api/my/alerts/count").then(r=>r.json()).then(j=> setCount(j.count||0)).catch(()=>{});
    const id=setInterval(()=> fetch("/api/my/alerts/count").then(r=>r.json()).then(j=> setCount(j.count||0)).catch(()=>{}), 5*60*1000);
    return ()=> clearInterval(id);
  },[role]);
  if(role==="admin" || count===0) return null;
  return (
    <Link href="/" className="flex items-center gap-2 rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900">
      <Icon name="warn" size={14} /><span>{count} تنبيه</span>
    </Link>
  );
}
