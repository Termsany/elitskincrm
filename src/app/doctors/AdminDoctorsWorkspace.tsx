"use client";
import {useEffect,useMemo,useState} from "react";
import {Card,Badge} from "@/components/ui";
import DoctorsClient from "./DoctorsClient";
import DoctorRequestsClient from "../admin/requests/DoctorRequestsClient";

type Doc={id:string;name:string;clinic_name:string;city:string;specialty:string;classification:string;phone:string;email:string;status:string};
export default function AdminDoctorsWorkspace({initial,initialQ}:{initial:Doc[];initialQ:string}){
 const [tab,setTab]=useState<"doctors"|"requests">("doctors");
 const [pending,setPending]=useState(0);
 const cities=useMemo(()=>new Set(initial.map(x=>x.city).filter(Boolean)).size,[initial]);
 const active=useMemo(()=>initial.filter(x=>x.status==="active"||!x.status).length,[initial]);
 async function loadCount(){const r=await fetch("/api/doctor-requests",{cache:"no-store"}).catch(()=>null);if(r?.ok){const j=await r.json().catch(()=>null);setPending((j?.requests||[]).filter((x:any)=>x.status==="pending").length)}}
 useEffect(()=>{loadCount()},[tab]);
 return <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Card className="p-4"><div className="text-xs text-[var(--muted)]">إجمالي الأطباء</div><div className="mt-1 text-2xl font-extrabold">{initial.length}</div></Card><Card className="p-4"><div className="text-xs text-[var(--muted)]">الأطباء النشطون</div><div className="mt-1 text-2xl font-extrabold text-emerald-700">{active}</div></Card><Card className="p-4"><div className="text-xs text-[var(--muted)]">المدن / المناطق</div><div className="mt-1 text-2xl font-extrabold">{cities}</div></Card><Card className="p-4"><div className="text-xs text-[var(--muted)]">طلبات تحتاج مراجعة</div><div className="mt-1 text-2xl font-extrabold text-amber-700">{pending}</div></Card></div><div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2"><button onClick={()=>setTab("doctors")} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold ${tab==="doctors"?"bg-[var(--navy)] text-white":"text-[var(--muted)] hover:bg-slate-50"}`}>الأطباء والعيادات</button><button onClick={()=>setTab("requests")} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold ${tab==="requests"?"bg-[var(--navy)] text-white":"text-[var(--muted)] hover:bg-slate-50"}`}>طلبات التعديل <Badge tone={pending?"warn":"neutral"}>{pending}</Badge></button></div>{tab==="doctors"?<DoctorsClient initial={initial} initialQ={initialQ} role="admin"/>:<DoctorRequestsClient/>}</div>;
}
