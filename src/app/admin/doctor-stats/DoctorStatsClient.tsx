"use client";
import { useEffect, useState } from "react";
import { Card, Badge, Input, Label } from "@/components/ui";
type Row = { id:string; name:string; clinic_name:string; city:string; specialty:string; classification:string; phone:string; visits:number; samples:number; orders:number; last_visit:string|null; recent_notes:string };
export default function DoctorStatsClient(){
  const [rows,setRows]=useState<Row[]>([]);
  const [q,setQ]=useState("");
  useEffect(()=>{ fetch("/api/admin/doctor-stats").then(r=>r.json()).then(j=> setRows(j.doctors||[])); },[]);
  const filtered = rows.filter(r=> !q || `${r.name} ${r.clinic_name} ${r.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4">
        <Label>بحث</Label>
        <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث باسم الطبيب أو العيادة" />
        <div className="flex gap-2 mt-3">
          <a href="/api/exports/doctors" className="rounded-xl bg-[var(--navy)] text-white px-4 py-2 text-sm font-bold">تصدير</a>
          <span className="text-xs text-[var(--muted)] py-2">{filtered.length} طبيب</span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg)] text-xs text-[var(--muted)] sticky top-0"><tr><th className="text-right p-3">الطبيب</th><th className="text-right p-3">العيادة</th><th className="text-right p-3">الزيارات</th><th className="text-right p-3">العينات</th><th className="text-right p-3">الأوردرات</th><th className="text-right p-3">آخر زيارة</th><th className="text-right p-3">آخر ملاحظات</th></tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="p-3 font-semibold">{r.name} <span className="text-xs text-[var(--muted)]">({r.classification||"—"})</span></td>
                  <td className="p-3">{r.clinic_name}</td>
                  <td className="p-3"><Badge tone={r.visits>0?"success":"neutral"}>{r.visits}</Badge></td>
                  <td className="p-3">{r.samples}</td>
                  <td className="p-3">{r.orders}</td>
                  <td className="p-3 text-xs">{r.last_visit? new Date(r.last_visit).toLocaleDateString("ar-EG"): "—"}</td>
                  <td className="p-3 text-xs max-w-[28ch] truncate" title={r.recent_notes}>{r.recent_notes||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
