"use client";
import { useEffect, useState } from "react";
import { Card, Select, Label, Input, Button } from "@/components/ui";
type V = { id:string; visited_at:string; lat:number|null; lng:number|null; accuracy_m:number|null; rep_name:string; doctor_name:string; clinic_name:string };
export default function MapClient({ isAdmin, reps }: { isAdmin:boolean; reps:Array<{id:string; name:string}> }){
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [repId,setRepId]=useState("");
  const [visits,setVisits]=useState<V[]>([]);
  async function load(){
    const p=new URLSearchParams({date, ...(repId?{repId}:{})});
    const r=await fetch(`/api/map?${p.toString()}`).then(x=>x.json());
    setVisits(r.visits||[]);
  }
  useEffect(()=>{ load(); },[date, repId]);
  const withGps = visits.filter(v=> v.lat!=null && v.lng!=null);
  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4 flex flex-wrap gap-3">
        <div><Label>التاريخ</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        {isAdmin && <div><Label>المندوب</Label><Select value={repId} onChange={e=>setRepId(e.target.value)}><option value="">الكل</option>{reps.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>}
        <div className="flex items-end"><Button onClick={load}>تحديث</Button></div>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-[var(--muted)]">{visits.length} زيارة في {date} — {withGps.length} بها موقع</div>
        {withGps.length>0 ? (
          <div className="mt-3 rounded-xl overflow-hidden border border-[var(--border)]">
            <iframe
              title="map"
              width="100%" height="420" style={{border:0}}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${withGps.map(v=> `${v.lat},${v.lng}`).join("|")}&z=11&output=embed`}
            />
            <div className="p-3 text-xs text-[var(--muted)]">روابط مباشرة:</div>
            <div className="px-3 pb-3 flex flex-col gap-1">
              {withGps.map(v=>(
                <a key={v.id} href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" className="text-sm text-[var(--gold)] font-semibold hover:underline">
                  {v.rep_name} → {v.doctor_name} ({v.clinic_name}) — {new Date(v.visited_at).toLocaleTimeString("ar-EG")}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-[var(--bg)] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            لا توجد مواقع GPS لهذا اليوم — المندوب يحتاج يضغط &#34;تحديد موقعي&#34; عند تسجيل الزيارة
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 font-bold border-b border-[var(--border)]">قائمة الزيارات</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="text-right p-3">المندوب</th><th className="text-right p-3">الطبيب</th><th className="text-right p-3">الوقت</th><th className="text-right p-3">الموقع</th></tr></thead>
            <tbody>
              {visits.map(v=>(
                <tr key={v.id} className="border-t border-[var(--border)]">
                  <td className="p-3">{v.rep_name}</td>
                  <td className="p-3">{v.doctor_name} · {v.clinic_name}</td>
                  <td className="p-3 text-xs">{new Date(v.visited_at).toLocaleString("ar-EG")}</td>
                  <td className="p-3 text-xs">{v.lat!=null? <a href={`https://maps.google.com/?q=${v.lat},${v.lng}`} target="_blank" className="text-[var(--gold)] font-bold">فتح الخريطة</a> : "—"}</td>
                </tr>
              ))}
              {visits.length===0 && <tr><td colSpan={4} className="p-6 text-center text-[var(--muted)]">لا زيارات</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
