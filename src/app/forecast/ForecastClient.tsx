"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { TargetPlanningClient, fetchTargetPlan, targetRequest } from "./TargetPlanningClient";
import type { ComponentProps } from "react";

type Clinic = { id: string; name: string; city?: string; doctor_count?: number };
const clinicLabel=(c?:Clinic, all:Clinic[] = [])=>{
 if(!c)return undefined;
 const base=`${c.name}${c.city?` — ${c.city}`:""}`;
 const norm=(v:string)=>v.trim().replace(/\s+/g," ").toLocaleLowerCase();
 const same=all.filter(x=>norm(x.name)===norm(c.name)&&norm(x.city??"")===norm(c.city??""));
 if(same.length<2)return base;
 const prefix=[8,12,16,36].find(n=>new Set(same.map(x=>x.id.slice(0,n))).size===same.length)??36;
 return `${base} · #${c.id.slice(0,prefix)}`;
};
type Product = { id: string; name: string };
type Line = { clinic_id: string; product_id: string; qty: number;unit_price?:string };
type Forecast = { id?: string; status: string; lines: Line[]; submitted_at?: string; review_due_at?: string; rejection_reason?: string; change_status?: string };
type Sale = { id: string; clinic_id: string; product_id: string; qty: number; status: string; kind?:string; direction?:number; reason?:string; unit_price?:string; source_sale_id?:string|null; rep_name?: string; rep_id?: string };
type Target = Line & { rep_id: string; rep_name?: string };
export type ForecastData = {
  month: string; clinics: Clinic[]; products: Product[]; prices: Array<{clinic_id:string;product_id:string;price:number;effective_month?:string}>;
  forecast: Forecast | null; approved_baseline?:Forecast|null; targets: Target[]; sales: Sale[];
  summary: { target_qty?: number; sold_qty?: number; target_value?:number; actual_value?:number; pacing_qty?: number; late_clinics?: Clinic[]; forecast_qty?: number; progress_pct?: number; days_remaining?: number };
  prior_month_lines?: Line[]; deadline?: string; is_late?: boolean; is_closed?: boolean;
};
type Pending = Forecast & { id: string; rep_id: string; rep_name: string; month: string };
type AdminData = { month: string; approved_sales?:Array<{rep_id:string;clinic_id:string;product_id:string;quantity:number;unit_price:string;kind:string;direction:number}>;approved_forecasts?:Array<{rep_id:string;clinic_id:string;product_id:string;quantity:number}>; pending: Pending[]; team: Array<{rep_id:string;rep_name:string;target_qty:number;sold_qty:number;forecast_qty?:number}>; alerts: Array<{id:string;message:string;severity?:string}>; sales: Sale[]; clinics: Clinic[]; products: Product[]; doctors?: Array<{id:string;name:string;clinic_id?:string|null;clinic_name?:string;city?:string;clinic_link_manual?:boolean}>; prices: ForecastData['prices']; targets: Target[]; price_scope_supported?:boolean; summary?: {pending_forecasts?:number;pending_sales?:number}; is_closed?:boolean; close_blockers?:string[] };
type Role = "admin" | "sales_rep";

async function jsonRequest(url:string, init?:RequestInit) {
  const res = await fetch(url, {cache:"no-store",...init});
  let body: unknown;
  try { body = await res.json(); } catch { throw new Error("تعذر قراءة استجابة الخادم"); }
  if (!res.ok) throw new Error(typeof body === "object" && body !== null && "error" in body ? String(body.error) : `فشل الطلب (${res.status})`);
  return body;
}
export async function fetchForecast(month:string, role:Role):Promise<ForecastData | AdminData> {
 if (role !== "admin") return normalizeRepForecast(await jsonRequest(`/api/forecast?month=${encodeURIComponent(month)}`));
 const [queue, clinicDirectory, productDirectory] = await Promise.all([
  jsonRequest(`/api/admin/forecast?month=${encodeURIComponent(month)}`),
  jsonRequest("/api/admin/forecast/clinics"),jsonRequest("/api/admin/products")
 ]) as [any,any,any];
 if (!Array.isArray(queue.pending)||!Array.isArray(queue.pending_sales)||!Array.isArray(queue.team)||!Array.isArray(clinicDirectory.clinics)||!Array.isArray(productDirectory.products)) throw new Error("استجابة الإدارة غير مكتملة");
 const blockerLabels:Record<string,string>={pending_forecasts:"توقعات معلّقة",pending_sales:"مبيعات معلّقة",pending_breakdowns:"تفصيل هدف شهر معلّق",pending_year_allocations:"توزيع هدف سنوي معلّق"};
 const close_blockers:string[]=Array.isArray(queue.close_blockers)?queue.close_blockers:
  queue.close_blockers&&typeof queue.close_blockers==="object"?Object.entries(blockerLabels).flatMap(([key,label])=>{const count=Number(queue.close_blockers[key]??0);return count>0?[`${label}: ${count}`]:[]}):[];
 return {...queue,close_blockers,clinics:clinicDirectory.clinics,doctors:clinicDirectory.doctors,products:productDirectory.products.filter((p:Product&{active?:boolean})=>p.active!==false),
  pending:queue.pending.map((p:any)=>({...p,month:String(p.month).slice(0,7),lines:p.lines.map((l:any)=>({...l,qty:Number(l.qty??l.quantity)}))})),
  sales:queue.pending_sales.map((s:any)=>({...s,qty:Number(s.qty??s.quantity)})),
  team:queue.team.map((t:any)=>({...t,target_qty:Number(t.target_qty??t.target),sold_qty:Number(t.sold_qty??t.actual)})),
  prices:queue.prices??[],targets:(queue.targets??[]).map((t:any)=>({...t,qty:Number(t.quantity??t.qty)})),price_scope_supported:queue.price_scope_supported===true||(Array.isArray(queue.prices)&&Array.isArray(queue.targets)&&typeof queue.is_closed==="boolean"),alerts:queue.alerts??queue.pending.filter((p:any)=>p.reminder_due).map((p:any)=>({id:p.id,message:`توقع ${p.rep_name} تجاوزت ٤٨ ساعة دون قرار`}))};
}
export async function fetchSourceSales(month:string):Promise<Sale[]> { const result=await jsonRequest(`/api/forecast/sales?month=${encodeURIComponent(month)}`) as {sales:Sale[]}; if(!Array.isArray(result.sales))throw new Error("استجابة المبيعات غير مكتملة");return result.sales.map(x=>({...x,qty:Number((x as Sale & {quantity?:number}).quantity??x.qty)})); }
export async function postForecastAction(url:string, body:Record<string,unknown>) {
  return jsonRequest(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
export function normalizeRepForecast(raw: any):ForecastData {
 if (!Array.isArray(raw.clinics)||!Array.isArray(raw.products)||!Array.isArray(raw.targets)||!Array.isArray(raw.sales)) throw new Error("استجابة التوقعات غير مكتملة");
 const rows = Array.isArray(raw.forecast) ? raw.forecast : null;
 const latest = rows?.[0];
 const effective = latest;
 const approvedRow=latest?.status!=="approved"?rows?.find((r:any)=>r.status==="approved"):undefined;
 const approved_baseline:Forecast|null=approvedRow?{id:approvedRow.id,status:"approved",lines:rows!.filter((r:any)=>r.id===approvedRow.id&&r.clinic_id).map((r:any)=>({clinic_id:r.clinic_id,product_id:r.product_id,qty:Number(r.quantity),unit_price:r.unit_price}))}:null;
 const lines = rows ? rows.filter((r:any)=>r.id===effective?.id && r.clinic_id).map((r:any)=>({clinic_id:r.clinic_id,product_id:r.product_id,qty:Number(r.quantity),unit_price:r.unit_price})) : raw.forecast?.lines ?? [];
 const forecast = rows ? (effective ? {id:effective.id,status:effective.status,lines,rejection_reason:latest?.status==="rejected"?latest.review_note:effective.review_note,submitted_at:effective.submitted_at,review_due_at:effective.status==="pending"&&effective.submitted_at?new Date(new Date(effective.submitted_at).getTime()+48*3600*1000).toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}):undefined} : null) : raw.forecast;
 const targetQty = Number(raw.summary?.target ?? raw.summary?.target_qty ?? 0);
 const soldQty = Number(raw.summary?.actual ?? raw.summary?.sold_qty ?? 0);
 const normalizedTargets=raw.targets.map((t:any)=>({...t,qty:Number(t.qty ?? t.quantity)}));
 const normalizedSales=raw.sales.map((s:any)=>({...s,qty:Number(s.qty ?? s.quantity)}));
 const pace=paceForMonth(raw.month,normalizedTargets,normalizedSales,raw.clinics);
 return {...raw, forecast,approved_baseline,targets:normalizedTargets,sales:normalizedSales,summary:{...raw.summary,target_qty:targetQty,sold_qty:soldQty,forecast_qty:(approved_baseline?.lines??lines).reduce((n:number,l:Line)=>n+l.qty,0),pacing_qty:raw.summary?.pacing_qty ?? pace.pacing_qty,days_remaining:raw.summary?.days_remaining ?? pace.days_remaining,late_clinics:raw.summary?.late_clinics ?? pace.late_clinics}};
}
export function actionRequest(role:Role, action:string, extra:Record<string,unknown>, month:string):{url:string;body:Record<string,unknown>} {
 if (action==="set_target") throw new Error("أهداف العيادات القديمة أُلغيت؛ استخدم تخطيط الأهداف المالية.");
 if (action==="sale" || action==="return" || action==="adjustment") return {url:"/api/forecast/sales",body:{month,clinic_id:extra.clinic_id,product_id:extra.product_id,quantity:extra.qty,...(action==="sale"?{}:{kind:action,source_sale_id:extra.source_sale_id,reason:extra.reason,...(action==="adjustment"?{direction:extra.direction}:{})})}};
 if (action==="create_clinic"||action==="create_branch"||action==="link_doctor"||action==="auto_link_doctor") return {url:"/api/admin/forecast/clinics",body:{action:action==="create_clinic"?"create":action,...extra}};
 const body:Record<string,unknown>={action,month,...extra};
 if (extra.forecast_id) {body.id=extra.forecast_id;delete body.forecast_id;}
 if (extra.sale_id) {body.id=extra.sale_id;delete body.sale_id;}
 if (Array.isArray(extra.lines)) {
  body.lines=(extra.lines as Line[]).map(l=>({clinic_id:l.clinic_id,product_id:l.product_id,quantity:l.qty}));
  if (role==="admin" && action==="approve")body.action="edit_and_approve";
 }
 if (extra.qty !== undefined) {body.quantity=extra.qty;delete body.qty;}
 return {url:role==="admin"?"/api/admin/forecast":"/api/forecast",body};
}
export function buildReportRows(data:Pick<AdminData,"targets"|"approved_sales"|"approved_forecasts">){
 const rows=new Map<string,{rep_id:string;clinic_id:string;product_id:string;target_qty:number;target_value:number;forecast_qty:number;sold_qty:number;sold_value:number}>();
 const row=(rep_id:string,clinic_id:string,product_id:string)=>{const key=`${rep_id}:${clinic_id}:${product_id}`;let x=rows.get(key);if(!x){x={rep_id,clinic_id,product_id,target_qty:0,target_value:0,forecast_qty:0,sold_qty:0,sold_value:0};rows.set(key,x)}return x};
 for(const t of data.targets){const x=row(t.rep_id,t.clinic_id,t.product_id);x.target_qty+=t.qty;x.target_value+=t.qty*Number((t as Target&{unit_price?:string}).unit_price??0)}
 for(const f of data.approved_forecasts??[])row(f.rep_id,f.clinic_id,f.product_id).forecast_qty+=Number(f.quantity);
 for(const s of data.approved_sales??[]){const x=row(s.rep_id,s.clinic_id,s.product_id);const sign=s.kind==="return"||s.direction===-1?-1:1;x.sold_qty+=sign*Number(s.quantity);x.sold_value+=sign*Number(s.quantity)*Number(s.unit_price)}
 return [...rows.values()].sort((a,b)=>a.rep_id.localeCompare(b.rep_id)||a.clinic_id.localeCompare(b.clinic_id)||a.product_id.localeCompare(b.product_id));
}
export function canCloseMonth(month:string,data:AdminData,now=new Date()) {
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value;
 const todayMonth=`${get("year")}-${get("month")}`;
 const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 return (month<todayMonth || (month===todayMonth && Number(get("day"))>=lastDay)) && !data.is_closed && !data.close_blockers?.length && !data.pending.length && !data.sales.some(s=>s.status==="pending");
}
export function paceForMonth(month:string,targets:Target[],sales:Sale[],clinics:Clinic[],now=new Date()) {
 const today=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Riyadh",day:"2-digit"}).format(now);
 const current=riyadhMonth(now);const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 const elapsed=month<current?days:month>current?0:Number(today);
 const pacing=(target:number)=>Math.ceil(target*elapsed/days);
 const late_clinics=month===current&&elapsed>10?clinics.filter(c=>{
  const goal=targets.filter(t=>t.clinic_id===c.id).reduce((n,t)=>n+t.qty,0);
  const actual=sales.filter(s=>s.clinic_id===c.id&&s.status==="approved").reduce((n,s)=>n+(s.kind==="return"||s.direction===-1?-s.qty:s.qty),0);
  return goal>0&&actual<pacing(goal);
 }):[];
 return {pacing_qty:pacing(targets.reduce((n,t)=>n+t.qty,0)),days_remaining:Math.max(0,days-elapsed),late_clinics};
}
export function previousMonth(month:string) {
 const [year,m] = month.split("-").map(Number);
 const d = new Date(Date.UTC(year,m-2,1));
 return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
}
export function riyadhMonth(date:Date) {
 const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit"}).formatToParts(date);
 return `${parts.find(p=>p.type==="year")?.value}-${parts.find(p=>p.type==="month")?.value}`;
}
export async function fetchPreviousMonthLines(month:string):Promise<Line[]> {
 const previous = await fetchForecast(previousMonth(month),"sales_rep") as ForecastData;
 if (!previous.forecast?.lines?.length) throw new Error("لا توجد توقعات للشهر السابق للنسخ.");
 return previous.forecast.lines.map(line=>({...line}));
}
const num = (value:number|undefined) => Number(value ?? 0).toLocaleString("ar-SA");
const field = "min-h-11";
const statusLabel:Record<string,string> = {draft:"مسودة",submitted:"بانتظار المراجعة",pending:"بانتظار المراجعة",approved:"معتمد",rejected:"مرفوض",change_requested:"طلب تعديل",closed:"مغلق"};
const qty = (lines:Line[],clinic_id:string,product_id:string) => lines.find(x=>x.clinic_id===clinic_id && x.product_id===product_id)?.qty ?? 0;

export function ForecastView({role,data,loading,error,busy,month,lines,onMonth,onRetry,onLine,onCopy,onAction}: {
 role:Role;data:ForecastData|null;loading:boolean;error:string;busy:boolean;month:string;lines:Line[];
 onMonth:(v:string)=>void;onRetry:()=>void;onLine:(clinic_id:string,product_id:string,qty:number)=>void;onCopy:()=>void;onAction:(action:string,extra?:Record<string,unknown>)=>void;
}) {
 const [sale,setSale]=useState({clinic_id:"",product_id:"",qty:""});
 const [returnData,setReturnData]=useState({source_sale_id:"",qty:"",reason:"",kind:"return",direction:"decrease"});
 const [sourceMonth,setSourceMonth]=useState(month);const [sources,setSources]=useState<Sale[]>([]);const [sourceError,setSourceError]=useState("");
 useEffect(()=>setSourceMonth(month),[month]);
 useEffect(()=>{let cancelled=false;if(sourceMonth===month){setSources((data?.sales??[]).filter(s=>s.kind==="sale"&&s.status==="approved"));setSourceError("");return;}setSources([]);setSourceError("");void fetchSourceSales(sourceMonth).then(x=>{if(!cancelled)setSources(x)}).catch(e=>{if(!cancelled)setSourceError(e instanceof Error?e.message:"تعذر تحميل البيع الأصلي")});return()=>{cancelled=true};},[sourceMonth,month,data?.sales]);
 const [changeReason,setChangeReason]=useState("");
 const status=data?.forecast?.status ?? "draft";
 const editable=month===riyadhMonth(new Date()) && !data?.is_closed && (status==="draft" || (status==="rejected" && !data?.approved_baseline) || !data?.forecast);
 const canRequestChange=month===riyadhMonth(new Date()) && (status==="approved" || (status==="rejected" && !!data?.approved_baseline)) && !data?.is_closed;
 const summary=data?.summary;
 return <div className="space-y-5" dir="rtl">
  <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-[var(--navy)]">التوقعات والمبيعات</h1><p className="text-sm text-[var(--muted)]">التوقع تقدير المندوب؛ الهدف الرسمي يحدده المدير وحده.</p></div><label className="text-sm font-bold">الشهر <Input type="month" aria-label="الشهر" className={field} value={month} onChange={e=>onMonth(e.target.value)}/></label></header>
  {loading && <div role="status"><Card className="p-6">جارٍ تحميل بيانات الشهر…</Card></div>}
  {error && <div role="alert"><Card className="p-6 border-red-300"><p className="text-red-700">{error}</p><Button type="button" className="mt-3 min-h-11" onClick={onRetry}>إعادة المحاولة</Button></Card></div>}
  {!loading && !error && data && <>
   <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
    {([ ["الهدف الرسمي",summary?.target_qty],["المبيعات المعتمدة",summary?.sold_qty],["المسار المتوقع",summary?.pacing_qty],["توقعك",summary?.forecast_qty ?? lines.reduce((n,x)=>n+x.qty,0)] ] as const).map(([label,value])=><Card key={label} className="p-4"><p className="text-sm text-[var(--muted)]">{label}</p><p className="text-2xl font-extrabold text-[var(--navy)]">{num(value)} <small className="text-xs">وحدة</small></p></Card>)}
   </div>
   <Card className="p-5"><div className="flex justify-between gap-3"><h2 className="font-extrabold">التقدم نحو الهدف</h2><strong>{num(summary?.progress_pct ?? (summary?.target_qty ? Math.round((summary.sold_qty ?? 0)/summary.target_qty*100) : 0))}%</strong></div><div role="progressbar" aria-label="التقدم نحو الهدف" aria-valuenow={Math.min(100,Math.max(0,summary?.progress_pct ?? (summary?.target_qty ? Math.round((summary.sold_qty ?? 0)/summary.target_qty*100) : 0)))} aria-valuemin={0} aria-valuemax={100} className="h-3 bg-slate-100 rounded-full overflow-hidden mt-3"><div className="bg-[var(--gold)] h-full" style={{width:`${Math.min(100,Math.max(0,summary?.progress_pct ?? (summary?.target_qty ? (summary.sold_qty ?? 0)/summary.target_qty*100 : 0)))}%`}}/></div><p className="text-xs text-[var(--muted)] mt-2">المتبقي من الشهر: {num(summary?.days_remaining)} يوم · المسار حتى اليوم: {num(summary?.pacing_qty)} وحدة</p></Card>
   {(summary?.late_clinics?.length ?? 0)>0 && <Card className="p-4 border-amber-300"><h2 className="font-bold text-amber-800">عيادات متأخرة</h2><p className="text-sm">{summary?.late_clinics?.map(c=>clinicLabel(c,data.clinics)).join("، ")}</p></Card>}
   <div className="grid grid-cols-2 gap-3"><Card className="p-4"><p>قيمة الهدف الرسمي</p><strong>{num(summary?.target_value)} ر.س</strong></Card><Card className="p-4"><p>قيمة المبيعات المعتمدة</p><strong>{num(summary?.actual_value)} ر.س</strong></Card></div>
   {data.approved_baseline&&<Card className="p-4 border-emerald-300"><h2 className="font-bold">التوقع المعتمد الساري</h2><p>{num(data.approved_baseline.lines.reduce((n,l)=>n+l.qty,0))} وحدة · {num(data.approved_baseline.lines.reduce((n,l)=>n+l.qty*Number(l.unit_price??0),0))} ر.س</p><p className="text-sm text-[var(--muted)]">{status==="rejected"?"مقترح التعديل المرفوض":"مقترح التعديل المعلّق"}: {num(data.forecast?.lines.reduce((n,l)=>n+l.qty,0))} وحدة؛ {status==="rejected"?"لم يغيّر التوقع المعتمد.":"لا يدخل الإنجاز أو التقرير حتى قرار المدير."}</p></Card>}
   <Card className="p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-extrabold">توقع العيادات × المنتجات</h2><p className="text-xs text-[var(--muted)]">كل عيادة مستقلة، والكميات لكل منتج. الحالة: <Badge>{statusLabel[status] ?? status}</Badge></p></div>{editable && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCopy}>نسخ الشهر السابق</Button>}</div>
    {canRequestChange&&<p className="text-sm text-[var(--muted)]">عدّل الكميات هنا ثم أرسل سبب طلب التعديل؛ النسخة المعتمدة لا تتغير حتى يوافق المدير.</p>}
    {data.forecast?.rejection_reason && <p role="alert" className="text-red-700">سبب الرفض: {data.forecast.rejection_reason}</p>}
    {data.forecast?.review_due_at && <p className="text-sm text-amber-800">تنبيه المراجعة خلال ٤٨ ساعة: {data.forecast.review_due_at}</p>}
    {data.is_late && <p className="text-sm text-red-700">انتهت مهلة الإرسال في اليوم الثالث؛ اطلب استثناء من المدير.</p>}
    {data.is_closed && <p className="text-sm text-red-700">الشهر مغلق؛ لا يمكن التعديل.</p>}
    {!data.clinics.length || !data.products.length ? <p className="text-sm text-[var(--muted)]">لا توجد عيادات أو منتجات مخصصة لهذا الشهر.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr className="bg-slate-50"><th className="p-3 text-right">العيادة</th>{data.products.map(p=><th className="p-3 text-right" key={p.id}>{p.name}</th>)}</tr></thead><tbody>{data.clinics.map(c=><tr className="border-t" key={c.id}><th scope="row" className="p-3 text-right">{clinicLabel(c,data.clinics)}</th>{data.products.map(p=><td className="p-2" key={p.id}><Input type="number" min="0" step="1" inputMode="numeric" aria-label={`كمية ${p.name} في ${clinicLabel(c,data.clinics)}`} className={field} value={qty(lines,c.id,p.id)} disabled={(!editable && !canRequestChange) || busy} onChange={e=>onLine(c.id,p.id,Number(e.target.value))}/><span className="text-xs text-[var(--muted)]">الهدف: {num(data.targets.find(t=>t.clinic_id===c.id && t.product_id===p.id)?.qty)} · السعر: {num(Number(data.prices.find(x=>x.clinic_id===c.id&&x.product_id===p.id)?.price??0))} ر.س</span></td>)}</tr>)}</tbody></table></div>}
    {data.forecast?.status==="approved"&&<p className="text-sm font-bold">قيمة النسخة المعتمدة: {num(data.forecast.lines.reduce((n,l)=>n+l.qty*Number(l.unit_price??data.prices.find(p=>p.clinic_id===l.clinic_id&&p.product_id===l.product_id)?.price??0),0))} ر.س</p>}<p className="text-sm font-bold">قيمة التوقع المقترح بسعر الشهر الحالي: {num(lines.reduce((n,l)=>n+l.qty*Number(data.prices.find(p=>p.clinic_id===l.clinic_id&&p.product_id===l.product_id)?.price??0),0))} ر.س</p>
    <div className="flex flex-wrap gap-2">{editable ? <><Button className="min-h-11" disabled={busy||!data.clinics.length} onClick={()=>onAction("save",{lines})}>حفظ مسودة</Button><Button className="min-h-11" disabled={busy||!!data.is_late||!data.clinics.length} onClick={()=>onAction("submit",{lines})}>إرسال للمراجعة</Button></> : canRequestChange && <div className="flex flex-wrap gap-2"><Input aria-label="سبب طلب التعديل" placeholder="سبب طلب التعديل" value={changeReason} onChange={e=>setChangeReason(e.target.value)}/><Button className="min-h-11" disabled={busy||!changeReason.trim()} onClick={()=>onAction("request_change",{reason:changeReason.trim()})}>طلب تعديل</Button></div>}</div>
   </Card>
   <Card className="p-5 space-y-3"><h2 className="font-extrabold">تسجيل بيع</h2><p className="text-xs text-[var(--muted)]">البيع المرسل ينتظر موافقة المدير ولا يدخل في المحقق قبل اعتماده.</p><div className="grid sm:grid-cols-3 gap-3"><Select aria-label="عيادة البيع" className={field} value={sale.clinic_id} onChange={e=>setSale({...sale,clinic_id:e.target.value})}><option value="">اختر العيادة</option>{data.clinics.map(c=><option key={c.id} value={c.id}>{clinicLabel(c,data.clinics)}</option>)}</Select><Select aria-label="منتج البيع" className={field} value={sale.product_id} onChange={e=>setSale({...sale,product_id:e.target.value})}><option value="">اختر المنتج</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select><Input type="number" min="1" step="1" aria-label="كمية البيع" placeholder="الكمية" className={field} value={sale.qty} onChange={e=>setSale({...sale,qty:e.target.value})}/></div><Button className="min-h-11" disabled={busy||month!==riyadhMonth(new Date())||!!data.is_closed||!sale.clinic_id||!sale.product_id||!Number.isInteger(Number(sale.qty))||Number(sale.qty)<=0} onClick={()=>onAction("sale",{clinic_id:sale.clinic_id,product_id:sale.product_id,qty:Number(sale.qty)})}>تسجيل بيع</Button>{data.sales.length>0 && <div className="text-sm space-y-1">{data.sales.map(s=><p key={s.id}>{clinicLabel(data.clinics.find(c=>c.id===s.clinic_id),data.clinics)} · {data.products.find(p=>p.id===s.product_id)?.name} · {num(s.qty)} · {statusLabel[s.status]??s.status}</p>)}</div>}</Card>
  <Card className="p-5 space-y-3"><h2 className="font-extrabold">تسجيل مرتجع أو تصحيح بيع</h2><p className="text-xs text-[var(--muted)]">مرتجع مرتبط ببيع معتمد؛ يُرسل للمراجعة ولا يُغيّر أصل العملية.</p><label className="block text-sm">شهر البيع الأصلي <Input aria-label="شهر البيع الأصلي" type="month" className={field} value={sourceMonth} max={month} onChange={e=>{setSourceMonth(e.target.value);setReturnData({...returnData,source_sale_id:""})}}/></label>{sourceError&&<p role="alert" className="text-red-700">{sourceError}</p>}<Select aria-label="نوع التسوية" className={field} value={returnData.kind} onChange={e=>setReturnData({...returnData,kind:e.target.value})}><option value="return">مرتجع</option><option value="adjustment">تصحيح بيع</option></Select>{returnData.kind==="adjustment"&&<Select aria-label="اتجاه التصحيح" className={field} value={returnData.direction} onChange={e=>setReturnData({...returnData,direction:e.target.value})}><option value="decrease">نقص في الكمية</option><option value="increase">زيادة في الكمية</option></Select>}<Select aria-label="البيع الأصلي" className={field} value={returnData.source_sale_id} onChange={e=>setReturnData({...returnData,source_sale_id:e.target.value})}><option value="">اختر البيع المعتمد</option>{sources.map(s=><option key={s.id} value={s.id}>{clinicLabel(data.clinics.find(c=>c.id===s.clinic_id),data.clinics)} · {data.products.find(p=>p.id===s.product_id)?.name} · {num(s.qty)}</option>)}</Select><Input type="number" min="1" step="1" aria-label="كمية المرتجع" placeholder="كمية المرتجع" className={field} value={returnData.qty} onChange={e=>setReturnData({...returnData,qty:e.target.value})}/><Textarea aria-label="سبب المرتجع" placeholder="سبب المرتجع" value={returnData.reason} onChange={e=>setReturnData({...returnData,reason:e.target.value})}/><Button className="min-h-11" disabled={busy||month!==riyadhMonth(new Date())||!returnData.source_sale_id||!Number.isInteger(Number(returnData.qty))||Number(returnData.qty)<=0||!returnData.reason.trim()} onClick={()=>{const source=sources.find(s=>s.id===returnData.source_sale_id);if(source)onAction(returnData.kind,{source_sale_id:source.id,clinic_id:source.clinic_id,product_id:source.product_id,qty:Number(returnData.qty),reason:returnData.reason.trim(),direction:returnData.direction});}}>{returnData.kind==="return"?"تسجيل مرتجع":"إرسال تصحيح بيع"}</Button></Card>
  </>}
 </div>;
}

export function AdminForecastView({data,loading,error,busy,month,onMonth,onRetry,onAction}:{data:AdminData|null;loading:boolean;error:string;busy:boolean;month:string;onMonth:(v:string)=>void;onRetry:()=>void;onAction:(action:string,extra?:Record<string,unknown>)=>void}) {
 const [reason,setReason]=useState(""); const [saleReason,setSaleReason]=useState(""); const [selected,setSelected]=useState(""); const [edits,setEdits]=useState<Line[]>([]);
 const [price,setPrice]=useState({clinic_id:"",product_id:"",price:""});
 const [clinicName,setClinicName]=useState(""); const [clinicCity,setClinicCity]=useState(""); const [link,setLink]=useState({doctor_id:"",clinic_id:""});
 const [reportFilter,setReportFilter]=useState({rep_id:"",clinic_id:"",product_id:""});
 const [lateRep,setLateRep]=useState(""); const [lateReason,setLateReason]=useState("");
 const current=data?.pending.find(f=>f.id===selected);
 const action=(name:string,extra:Record<string,unknown>)=>onAction(name,extra);
 return <div dir="rtl" className="space-y-5"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-extrabold text-[var(--navy)]">إدارة التوقعات والأهداف</h1><p className="text-sm text-[var(--muted)]">الهدف الرسمي والأسعار تاريخية ولا يعدلها المندوب.</p></div><label className="text-sm font-bold">الشهر <Input type="month" aria-label="الشهر" className={field} value={month} onChange={e=>onMonth(e.target.value)}/></label></header>
 {loading && <div role="status"><Card className="p-6">جارٍ التحميل…</Card></div>}{error && <div role="alert"><Card className="p-6"><p className="text-red-700">{error}</p><Button className="min-h-11 mt-2" onClick={onRetry}>إعادة المحاولة</Button></Card></div>}
 {!loading&&!error&&data&&<>
 <div className="grid sm:grid-cols-3 gap-3"><Card className="p-4">توقعات للمراجعة <strong className="block text-2xl">{num(data.pending.length)}</strong></Card><Card className="p-4">مبيعات للمراجعة <strong className="block text-2xl">{num(data.sales.filter(s=>s.status==="pending").length)}</strong></Card><Card className="p-4">تنبيهات <strong className="block text-2xl">{num(data.alerts.length)}</strong></Card></div>
 <Card className="p-5 space-y-3"><h2 className="font-extrabold">مراجعة التوقعات</h2>{!data.pending.length&&<p>لا توجد توقعات معلقة.</p>}{data.pending.map(f=><div key={f.id} className="border rounded-xl p-3 space-y-2"><div className="flex flex-wrap justify-between"><strong>{f.rep_name} · {f.month}</strong><Badge tone="warn">{statusLabel[f.status]??f.status}</Badge></div><p className="text-xs">{f.lines.map(l=>`${clinicLabel(data.clinics.find(c=>c.id===l.clinic_id),data.clinics)??l.clinic_id} / ${data.products.find(p=>p.id===l.product_id)?.name??l.product_id}: ${num(l.qty)}`).join("، ")}</p><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={busy} onClick={()=>action("approve",{forecast_id:f.id})}>اعتماد</Button><Button variant="outline" className="min-h-11" disabled={busy||!reason.trim()} onClick={()=>action("reject",{forecast_id:f.id,reason:reason.trim()})}>رفض مع السبب</Button><Button variant="outline" className="min-h-11" onClick={()=>{setSelected(f.id);setEdits(f.lines.map(l=>({...l})));}}>تعديل ثم اعتماد</Button><Button variant="outline" className="min-h-11" disabled={busy||!reason.trim()} onClick={()=>action("allow_late",{rep_id:f.rep_id,month:f.month,reason:reason.trim()})}>استثناء التأخير</Button></div></div>)}{data.pending.length>0&&<Textarea aria-label="سبب الرفض" placeholder="سبب الرفض إلزامي" value={reason} onChange={e=>setReason(e.target.value)}/ >}
 {current&&<div className="rounded-xl border-2 border-[var(--gold)] p-3 space-y-3"><h3 className="font-bold">تعديل توقع {current.rep_name} ثم اعتماده</h3>{edits.map((l,i)=><label className="flex flex-wrap items-center gap-2 text-sm" key={`${l.clinic_id}-${l.product_id}`}>{clinicLabel(data.clinics.find(c=>c.id===l.clinic_id),data.clinics)} / {data.products.find(p=>p.id===l.product_id)?.name}<Input className={`w-28 ${field}`} type="number" min="0" step="1" aria-label={`كمية تعديل ${i}`} value={l.qty} onChange={e=>setEdits(edits.map((x,j)=>i===j?{...x,qty:Number(e.target.value)}:x))}/></label>)}<Button className="min-h-11" disabled={busy||edits.some(x=>!Number.isInteger(x.qty)||x.qty<0)} onClick={()=>action("approve",{forecast_id:current.id,lines:edits})}>حفظ التعديل واعتماد</Button><Button variant="outline" className="min-h-11" onClick={()=>setSelected("")}>إلغاء</Button></div>}</Card>
 <Card className="p-5 space-y-3"><h2 className="font-extrabold">استثناء تأخر الإرسال</h2><p className="text-sm text-[var(--muted)]">اختر المندوب حتى لو لم يقدم توقعًا بعد. يسمح الخادم بالاستثناء بعد اليوم الثالث للشهر الحالي فقط.</p><Select aria-label="مندوب الاستثناء" className={field} value={lateRep} onChange={e=>setLateRep(e.target.value)}><option value="">اختر المندوب</option>{data.team.map(t=><option key={t.rep_id} value={t.rep_id}>{t.rep_name}</option>)}</Select><Textarea aria-label="سبب الاستثناء" placeholder="سبب الاستثناء" value={lateReason} onChange={e=>setLateReason(e.target.value)}/><Button className="min-h-11" disabled={busy||!lateRep||!lateReason.trim()||month!==riyadhMonth(new Date())} onClick={()=>action("allow_late",{rep_id:lateRep,reason:lateReason.trim()})}>السماح بالإرسال المتأخر</Button></Card>
 <div className="grid lg:grid-cols-2 gap-4"><Card className="p-5 space-y-3"><h2 className="font-extrabold">سعر العيادة والمنتج</h2>{data.price_scope_supported!==true&&<p role="alert" className="text-sm text-red-700">تحديد السعر لكل عيادة غير متاح في واجهة الخادم الحالية؛ تم تعطيل الحفظ لتجنب تغيير سعر المنتج لكل العيادات.</p>}<Select aria-label="عيادة السعر" className={field} value={price.clinic_id} onChange={e=>setPrice({...price,clinic_id:e.target.value})}><option value="">العيادة</option>{data.clinics.map(c=><option key={c.id} value={c.id}>{clinicLabel(c,data.clinics)}</option>)}</Select><Select aria-label="منتج السعر" className={field} value={price.product_id} onChange={e=>setPrice({...price,product_id:e.target.value})}><option value="">المنتج</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select><Input aria-label="السعر" className={field} type="number" min="0" step="0.01" value={price.price} onChange={e=>setPrice({...price,price:e.target.value})}/><Button className="min-h-11" disabled={busy||data.price_scope_supported!==true||!price.clinic_id||!price.product_id||price.price===""||Number(price.price)<=0} onClick={()=>action("set_price",{month,...price,price:Number(price.price)})}>حفظ السعر</Button><div className="text-xs">{data.prices.map(p=><p key={`${p.clinic_id}-${p.product_id}-${p.effective_month??month}`}>{clinicLabel(data.clinics.find(c=>c.id===p.clinic_id),data.clinics)} / {data.products.find(x=>x.id===p.product_id)?.name}: {num(p.price)} · {p.effective_month??month}</p>)}</div></Card>
</div>
 <Card className="p-5 space-y-3"><h2 className="font-extrabold">العيادات وربط الأطباء</h2><p className="text-xs text-[var(--muted)]">تُضاف عيادات دليل الأطباء تلقائيًا؛ الاسم والمدينة يحددان العيادة. يمكنك تصحيح ربط أي طبيب يدويًا.</p><div className="flex flex-wrap gap-2"><Input aria-label="اسم العيادة الجديدة" className={`sm:w-72 ${field}`} value={clinicName} onChange={e=>setClinicName(e.target.value)} placeholder="اسم العيادة الجديدة"/><Input aria-label="مدينة العيادة الجديدة" className={`sm:w-48 ${field}`} value={clinicCity} onChange={e=>setClinicCity(e.target.value)} placeholder="المدينة"/><Button className="min-h-11" disabled={busy||!clinicName.trim()} onClick={()=>action("create_clinic",{name:clinicName.trim(),city:clinicCity.trim()})}>إنشاء عيادة</Button><Button variant="outline" className="min-h-11" disabled={busy||!clinicName.trim()} onClick={()=>action("create_branch",{name:clinicName.trim(),city:clinicCity.trim()})}>إنشاء فرع مستقل</Button></div><div className="grid sm:grid-cols-2 gap-2"><Select aria-label="الطبيب الموجود" className={field} value={link.doctor_id} onChange={e=>setLink({...link,doctor_id:e.target.value})}><option value="">اختر طبيبًا موجودًا</option>{(data.doctors??[]).map(d=><option key={d.id} value={d.id}>{d.name} {d.clinic_name?`— ${d.clinic_name}${d.city?`، ${d.city}`:""}`:""}{d.clinic_id?` (الربط الحالي: ${clinicLabel(data.clinics.find(c=>c.id===d.clinic_id),data.clinics)??d.clinic_id})`:""}{d.clinic_link_manual?" (ربط يدوي)":""}</option>)}</Select><Select aria-label="العيادة المراد ربطها" className={field} value={link.clinic_id} onChange={e=>setLink({...link,clinic_id:e.target.value})}><option value="">اختر العيادة</option>{data.clinics.map(c=><option key={c.id} value={c.id}>{clinicLabel(c,data.clinics)}</option>)}</Select></div><Button className="min-h-11" disabled={busy||!link.doctor_id||!link.clinic_id} onClick={()=>action("link_doctor",link)}>تصحيح ربط الطبيب</Button><Button variant="outline" className="min-h-11" disabled={busy||!link.doctor_id} onClick={()=>action("auto_link_doctor",{doctor_id:link.doctor_id})}>العودة للربط التلقائي</Button></Card>
 <Card className="p-5 space-y-2"><h2 className="font-extrabold">اعتماد المبيعات</h2>{!data.sales.some(s=>s.status==="pending")&&<p>لا توجد مبيعات معلقة.</p>}{data.sales.some(s=>s.status==="pending")&&<Textarea aria-label="سبب رفض البيع" placeholder="سبب رفض البيع أو التسوية" value={saleReason} onChange={e=>setSaleReason(e.target.value)}/ >}{data.sales.filter(s=>s.status==="pending").map(s=><div key={s.id} className="border rounded-xl p-3 space-y-2"><p>{s.rep_name} · {clinicLabel(data.clinics.find(c=>c.id===s.clinic_id),data.clinics)} · {data.products.find(p=>p.id===s.product_id)?.name} · {num(s.qty)} وحدة · {s.kind==="return"?"مرتجع":s.kind==="adjustment"?(s.direction===-1?"تصحيح نقص":"تصحيح زيادة"):"بيع"} · {num(Number(s.unit_price??0))} ر.س/وحدة</p>{s.source_sale_id&&<p className="text-xs">البيع الأصلي: {s.source_sale_id}</p>}{s.reason&&<p className="text-xs">السبب: {s.reason}</p>}<div className="flex gap-2"><Button className="min-h-11" disabled={busy} onClick={()=>action("approve_sale",{sale_id:s.id})}>اعتماد</Button><Button variant="outline" className="min-h-11" disabled={busy||!saleReason.trim()} onClick={()=>action("reject_sale",{sale_id:s.id,reason:saleReason.trim()})}>رفض</Button></div></div>)}</Card>
 <Card className="p-5 space-y-3"><h2 className="font-extrabold">تقرير الشهر حسب المندوب والعيادة والمنتج</h2><div className="grid sm:grid-cols-3 gap-2"><Select aria-label="فلتر المندوب" value={reportFilter.rep_id} onChange={e=>setReportFilter({...reportFilter,rep_id:e.target.value})}><option value="">كل المناديب</option>{data.team.map(t=><option value={t.rep_id} key={t.rep_id}>{t.rep_name}</option>)}</Select><Select aria-label="فلتر العيادة" value={reportFilter.clinic_id} onChange={e=>setReportFilter({...reportFilter,clinic_id:e.target.value})}><option value="">كل العيادات</option>{data.clinics.map(c=><option value={c.id} key={c.id}>{clinicLabel(c,data.clinics)}</option>)}</Select><Select aria-label="فلتر المنتج" value={reportFilter.product_id} onChange={e=>setReportFilter({...reportFilter,product_id:e.target.value})}><option value="">كل المنتجات</option>{data.products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</Select></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr>{["المندوب","العيادة","المنتج","توقع معتمد","الهدف الرسمي","الفعلي المعتمد","قيمة الهدف","قيمة الفعلي"].map(h=><th className="p-2 text-right" key={h}>{h}</th>)}</tr></thead><tbody>{buildReportRows(data).filter(r=>(!reportFilter.rep_id||r.rep_id===reportFilter.rep_id)&&(!reportFilter.clinic_id||r.clinic_id===reportFilter.clinic_id)&&(!reportFilter.product_id||r.product_id===reportFilter.product_id)).map(r=><tr className="border-t" key={`${r.rep_id}-${r.clinic_id}-${r.product_id}`}><td className="p-2">{data.team.find(t=>t.rep_id===r.rep_id)?.rep_name??r.rep_id}</td><td className="p-2">{clinicLabel(data.clinics.find(c=>c.id===r.clinic_id),data.clinics)??r.clinic_id}</td><td className="p-2">{data.products.find(p=>p.id===r.product_id)?.name??r.product_id}</td><td className="p-2">{num(r.forecast_qty)}</td><td className="p-2">{num(r.target_qty)}</td><td className="p-2">{num(r.sold_qty)}</td><td className="p-2">{num(r.target_value)}</td><td className="p-2">{num(r.sold_value)}</td></tr>)}</tbody></table></div></Card>
 <Card className="p-5"><h2 className="font-extrabold mb-2">ترتيب المناديب</h2>{data.team.map((t,i)=><div className="flex justify-between border-t py-2 text-sm" key={t.rep_id}><span>{i+1}. {t.rep_name}</span><span>{num(t.sold_qty)} / {num(t.target_qty)} وحدة</span></div>)}</Card>
 <Card className="p-5"><h2 className="font-extrabold mb-2">التنبيهات</h2>{data.alerts.length?data.alerts.map(a=><p key={a.id} className="border-t py-2 text-sm">{a.message}</p>):<p>لا توجد تنبيهات.</p>}</Card>
 <Card className="p-5 space-y-2"><h2 className="font-extrabold">إغلاق الشهر</h2><p className="text-sm">يبدأ الإغلاق في آخر يوم من الشهر ويمكن تأجيله حتى حسم المعلقات، ويُمنع عند وجود توقعات أو مبيعات معلقة. يتحقق الخادم من الشروط أيضًا.</p>{(data.close_blockers??[]).map((b,i)=><p className="text-red-700 text-sm" key={i}>{b}</p>)}<Button className="min-h-11" disabled={busy||!canCloseMonth(month,data)} onClick={()=>{if(window.confirm(`إغلاق شهر ${month}؟ لا يمكن التراجع.`)) action("close",{month});}}>إغلاق الشهر</Button></Card>
 </>}
 </div>;
}

export default function ForecastClient({role}:{role:Role}) {
 const [month,setMonth]=useState(()=>riyadhMonth(new Date()));
 const [data,setData]=useState<ForecastData|AdminData|null>(null); const [lines,setLines]=useState<Line[]>([]);
 const [targetData,setTargetData]=useState<ComponentProps<typeof TargetPlanningClient>["data"]>(null);
 const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{setLoading(true);setError("");try{const [result,plan]=await Promise.all([fetchForecast(month,role),fetchTargetPlan(month,role)]);setData(result);setTargetData(plan);if(role!=="admin")setLines(((result as ForecastData).forecast?.lines??[]).map(x=>({...x})));}catch(e){setData(null);setTargetData(null);setError(e instanceof Error?e.message:"تعذر التحميل");}finally{setLoading(false);}},[month,role]);
 useEffect(()=>{void load();},[load]);
 const action=async(name:string,extra:Record<string,unknown>={})=>{setBusy(true);setError("");setNotice("");try{const payload=name==="request_change"?{...extra,lines}:extra;if(Array.isArray(payload.lines))payload.lines=(payload.lines as Line[]).filter(x=>x.qty>0);const request=actionRequest(role,name,payload,month);await postForecastAction(request.url,request.body);await load();setNotice("تم حفظ التغيير.");}catch(e){setError(e instanceof Error?e.message:"فشل الحفظ");}finally{setBusy(false);}};
 const targetAction=async(name:string,extra:Record<string,unknown>)=>{setBusy(true);setError("");setNotice("");try{const request=targetRequest(role,name,extra,month);await postForecastAction(request.url,request.body);await load();setNotice("تم إرسال التغيير للمراجعة.");}catch(e){setError(e instanceof Error?e.message:"فشل حفظ الهدف");}finally{setBusy(false);}};
 const onLine=(clinic_id:string,product_id:string,value:number)=>{if(!Number.isInteger(value)||value<0)return;setLines(old=>{const next=old.filter(x=>x.clinic_id!==clinic_id||x.product_id!==product_id);return [...next,{clinic_id,product_id,qty:value}];});};
 return <>{notice&&<p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}{busy&&<p role="status" className="mb-3">جارٍ الحفظ…</p>}{role==="admin"?<AdminForecastView data={data as AdminData|null} loading={loading} error={error} busy={busy} month={month} onMonth={setMonth} onRetry={()=>void load()} onAction={(name,extra)=>void action(name,extra)}/>:<ForecastView role={role} data={data as ForecastData|null} loading={loading} error={error} busy={busy} month={month} lines={lines} onMonth={setMonth} onRetry={()=>void load()} onLine={onLine} onCopy={()=>{setBusy(true);setError("");void fetchPreviousMonthLines(month).then(setLines).catch(e=>setError(e instanceof Error?e.message:"تعذر النسخ")).finally(()=>setBusy(false));}} onAction={(name,extra)=>void action(name,extra)}/>} {!loading&&!error&&data&&targetData&&<TargetPlanningClient role={role} month={month} data={targetData} directory={{clinics:data.clinics,products:data.products,prices:data.prices}} busy={busy} onAction={(name,extra)=>void targetAction(name,extra)}/>}</>;
}
