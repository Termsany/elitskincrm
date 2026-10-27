"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, Button, Input, Label, Select, Badge, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { distributeSuggestionsByArea, findFiveDayDuplicate, shiftPlanItems } from "@/lib/plan-workflow";
import { PLAN_PERIODS, planPeriodLabel, type PlanPeriod } from "@/lib/plan-periods";
import { canAdminReviewPlan } from "@/lib/plan-review";
import { isPlanWorkspacePayload, planTargetProgress, planWorkspaceTabs, representativeCanReceivePlan, type PlanWorkspaceTab } from "@/lib/plan-workspace";

type Plan = { id:string; user_id:string; user_name:string; period:string; period_start:string; period_end:string; status:string; admin_note:string; items_count:number; created_at:string; target_visits:number|null; rating:number|null; template_name:string };
type PlanSummary={total:number;pending:number;approved:number;needs_revision:number;rejected:number;planned_visits:number};
type RepPlanSummary={id:string;name:string;active:boolean;total:number;pending:number;approved:number;planned_visits:number};
type Doctor={id:string; name:string; clinic_name:string; city:string; classification?:string}; type Product={id:string; name:string}; type SavedTemplate={id:string; name:string; period_start:string; period_end:string; target_visits:number|null};

const statusLabel:Record<string,string>={draft:"مسودة", pending:"بانتظار الموافقة", approved:"معتمدة", rejected:"مرفوضة", needs_revision:"تحتاج تعديل"};
const statusTone:Record<string,"success"|"warn"|"danger"|"info"|"neutral">={draft:"neutral", pending:"warn", approved:"success", rejected:"danger", needs_revision:"info"};
const prioLabel:Record<string,string>={low:"منخفضة", medium:"متوسطة", high:"عالية", urgent:"عاجلة"};
const DAY_NAMES=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function iso(d:Date){ return d.toISOString().slice(0,10); }
// السعودية 2026 — أجازات رسمية
const SA_HOLIDAYS: Record<string,string> = {
  "2026-02-22": "يوم التأسيس", "2026-02-23": "يوم التأسيس",
  "2026-03-19": "عيد الفطر", "2026-03-20": "عيد الفطر", "2026-03-21": "عيد الفطر", "2026-03-22": "عيد الفطر",
  "2026-05-26": "عيد الأضحى", "2026-05-27": "عيد الأضحى", "2026-05-28": "عيد الأضحى", "2026-05-29": "عيد الأضحى",
  "2026-09-23": "اليوم الوطني",
  "2026-11-15": "إجازة إضافية",
};
function isHoliday(date:string){ return SA_HOLIDAYS[date] || null; }
function isWeekend(date:string){
  const d=new Date(date+"T12:00:00");
  const w=d.getDay();
  return w===5 || w===6; // الجمعة=5 والسبت=6 إجازة
}
function weekDays(startStr:string){
  if(!startStr) return [] as Array<{date:string; label:string; weekday:string; holiday:string|null; weekend:boolean}>;
  const s=new Date(startStr+"T12:00:00");
  return Array.from({length:7}, (_,i)=>{
    const d=new Date(s); d.setDate(s.getDate()+i);
    const date=iso(d);
    return { date, label: d.toLocaleDateString("ar-EG",{day:"numeric", month:"short"}), weekday: DAY_NAMES[d.getDay()], holiday: isHoliday(date), weekend: isWeekend(date) };
  });
}
function periodDays(startStr:string, period:PlanPeriod){
  if(!startStr) return [] as Array<{date:string; label:string; weekday:string; holiday:string|null; weekend:boolean}>;
  if(period === "weekly") return weekDays(startStr);
  const count = period === "daily" ? 1 : 30;
  const s=new Date(startStr+"T12:00:00");
  return Array.from({length:count}, (_,i)=>{ const d=new Date(s); d.setDate(s.getDate()+i); const date=iso(d); return {date,label:d.toLocaleDateString("ar-EG",{day:"numeric",month:"short"}),weekday:DAY_NAMES[d.getDay()],holiday:isHoliday(date),weekend:isWeekend(date)}; });
}
function workDays(startStr:string){
  return weekDays(startStr).filter(d=> !d.weekend && !d.holiday);
}

export default function PlansClient({ isAdmin, reps, doctors, products, initialStatus="", initialPeriod="", initialPlanId="", initialRepId="" }: { isAdmin:boolean; reps:any[]; doctors:Doctor[]; products:Product[]; currentUserId:string; initialStatus?:string; initialPeriod?:string; initialPlanId?:string; initialRepId?:string }){
  const [plans,setPlans]=useState<Plan[]>([]);
  const [loadError,setLoadError]=useState("");
  const [workspaceTab,setWorkspaceTab]=useState<PlanWorkspaceTab["id"]>(isAdmin&&initialStatus==="pending"?"review":"overview");
  const [planSearch,setPlanSearch]=useState("");
  const [planSummary,setPlanSummary]=useState<PlanSummary>({total:0,pending:0,approved:0,needs_revision:0,rejected:0,planned_visits:0});
  const [repPlanSummary,setRepPlanSummary]=useState<RepPlanSummary[]>([]);
  const [adminPlanRepId,setAdminPlanRepId]=useState<string>(initialRepId||reps.find(rep=>representativeCanReceivePlan(rep.active))?.id||"");
  const [viewRepId,setViewRepId]=useState<string>(initialRepId||"");
  const [editingPlanId,setEditingPlanId]=useState<string|null>(null);
  const [filter,setFilter]=useState(initialStatus); const [periodFilter,setPeriodFilter]=useState(initialPeriod);
  const [planPeriod,setPlanPeriod]=useState<PlanPeriod>("weekly");
  const [start,setStart]=useState(""); const [end,setEnd]=useState("");
  const [targetVisits,setTargetVisits]=useState<number>(10);
  const [templateName,setTemplateName]=useState("");
  const [templates,setTemplates]=useState<SavedTemplate[]>([]);
  const [templateCopyStart,setTemplateCopyStart]=useState("");
  // Items keyed by date -> list of {doctor_id, product_id, note, priority}
  const [itemsByDay,setItemsByDay]=useState<Record<string, Array<{doctor_id:string; product_id:string; note:string; priority:string}>>>({});
  const items = useMemo(()=>{
    const out:Array<{doctor_id:string; planned_date:string; product_id:string; note:string; priority:string}>=[];
    for(const [date, list] of Object.entries(itemsByDay)){
      for(const it of list) out.push({doctor_id:it.doctor_id, planned_date:date, product_id:it.product_id, note:it.note, priority:it.priority});
    }
    return out;
  },[itemsByDay]);
  const [activeDay,setActiveDay]=useState<string|null>(null);
  const [pickerQ,setPickerQ]=useState(""); const [pickerSel,setPickerSel]=useState<string[]>([]); const [pickerMeta,setPickerMeta]=useState<Record<string,{product_id:string;priority:string;note:string}>>({}); const [pickerEditMode,setPickerEditMode]=useState(false);
  const [detail,setDetail]=useState<{plan:Plan & Record<string,unknown>; items:Array<Record<string,unknown>>; revisions:Array<{id:string; user_name:string; note:string; created_at:string}>; comments:Array<{id:string; body:string; user_name:string; created_at:string}>}|null>(null);
  const [adminNote,setAdminNote]=useState(""); const [editNote,setEditNote]=useState(""); const [commentBody,setCommentBody]=useState("");
  const [copyStart,setCopyStart]=useState("");
  const [reviewBusy,setReviewBusy]=useState(false);
  const [deepLinkOpened,setDeepLinkOpened]=useState(false);
  const [frequencies,setFrequencies]=useState<Array<{classification:string; visits_per_month:number}>>([]);
  const [coverage,setCoverage]=useState<Array<{classification:string; freq:number; doctors:number; expected:number; planned:number; coverage:number}>>([]);
  const [compliance,setCompliance]=useState<Array<{user_id:string; name:string; totalPlanned:number; totalDone:number; adherence:number}>>([]);
  const [executionRows,setExecutionRows]=useState<Array<Record<string,unknown>>>([]);
  const [executionSummary,setExecutionSummary]=useState({planned:0,done:0,missed:0});
  const [executionLoading,setExecutionLoading]=useState(false);

  const days = periodDays(start, planPeriod);
  const visiblePlans = (isAdmin && viewRepId ? plans.filter(p=>p.user_id===viewRepId) : plans).filter(p=>!planSearch.trim()||`${p.user_name} ${p.period} ${p.status} ${p.admin_note||""}`.toLowerCase().includes(planSearch.trim().toLowerCase()));
  const workspaceTabs=planWorkspaceTabs(isAdmin);
  const detailDays=useMemo(()=>{const groups:Record<string,Array<Record<string,unknown>>>={};for(const row of detail?.items||[]){const date=String(row.planned_date).slice(0,10);if(!groups[date])groups[date]=[];groups[date].push(row)}return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));},[detail]);

  async function load(){
    const p=new URLSearchParams();
    if(filter) p.set("status",filter);
    if(periodFilter) p.set("period",periodFilter);
    if(isAdmin && viewRepId) p.set("repId",viewRepId);
    try{
      const response=await fetch(`/api/plans?${p.toString()}`,{cache:"no-store"});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!isPlanWorkspacePayload(payload))throw new Error(String(payload?.error||"تعذر تحميل الخطط"));
      setPlans(payload.plans as Plan[]); setTemplates((Array.isArray(payload.templates)?payload.templates:[]) as SavedTemplate[]); setPlanSummary(payload.summary as unknown as PlanSummary); setRepPlanSummary((Array.isArray(payload.repSummary)?payload.repSummary:[]) as RepPlanSummary[]); setLoadError("");
    }catch(error){setLoadError(error instanceof Error?error.message:"تعذر تحميل الخطط");}
  }
  async function loadExecution(){
    setExecutionLoading(true);
    const base=start||new Date().toISOString().slice(0,10);
    const endDate=new Date(base+"T12:00:00"); endDate.setDate(endDate.getDate()+29);
    const p=new URLSearchParams({start:base,end:endDate.toISOString().slice(0,10)});
    if(isAdmin&&viewRepId)p.set("repId",viewRepId);
    const r=await fetch(`/api/plans/calendar?${p.toString()}`,{cache:"no-store"}).then(x=>x.json()).catch(()=>null);
    if(r){setExecutionRows(r.rows||[]);setExecutionSummary(r.summary||{planned:0,done:0,missed:0});}
    setExecutionLoading(false);
  }

  async function loadIQVIA(selectedRepId=viewRepId){
    const fr=await fetch("/api/plans/frequencies").then(x=>x.json()).catch(()=>null);
    if(fr) setFrequencies(fr.frequencies||[]);
    const coverageParams=new URLSearchParams();
    if(isAdmin && selectedRepId) coverageParams.set("userId",selectedRepId);
    const cr=await fetch(`/api/plans/coverage?${coverageParams.toString()}`).then(x=>x.json()).catch(()=>null);
    if(cr) setCoverage(cr.coverage||[]);
    if(isAdmin){
      const co=await fetch("/api/plans/compliance").then(x=>x.json()).catch(()=>null);
      if(co) setCompliance(co.compliance||[]);
    }
  }
  useEffect(()=>{ load(); loadIQVIA(viewRepId); },[filter, periodFilter, viewRepId]);
  useEffect(()=>{
    if(start){
      const s=new Date(start+"T12:00:00"); const e=new Date(s);
      e.setDate(e.getDate() + (planPeriod === "daily" ? 0 : planPeriod === "monthly" ? 29 : 6));
      setEnd(iso(e));
    }
  },[start, planPeriod]);

  const filteredDoctors = useMemo(()=>{
    const q=pickerQ.trim().toLowerCase(),selectedCity=doctors.find(d=>pickerSel.includes(d.id))?.city||doctors.find(d=>(itemsByDay[activeDay||""]||[]).some(x=>x.doctor_id===d.id))?.city||"";
    const rank=(value?:string)=>({A:0,B:1,C:2}[String(value||"").toUpperCase()]??3);
    return doctors.filter(d=>!q||`${d.name} ${d.clinic_name} ${d.city}`.toLowerCase().includes(q)).sort((a,b)=>Number(b.city===selectedCity)-Number(a.city===selectedCity)||rank(a.classification)-rank(b.classification)||a.city.localeCompare(b.city,"ar"));
  },[pickerQ, doctors, pickerSel, activeDay, itemsByDay]);

  function openDay(date:string){
    if(isWeekend(date) || isHoliday(date)){ alert("هذا اليوم إجازة"); return; }
    const dayItems=itemsByDay[date]||[];
    setPickerSel(dayItems.map(x=> x.doctor_id));
    setPickerMeta(Object.fromEntries(dayItems.map(x=>[x.doctor_id,{product_id:x.product_id||"",priority:x.priority||"medium",note:x.note||""}])));
    setPickerQ("");
    setPickerEditMode((itemsByDay[date]||[]).length===0);
    setActiveDay(date);
  }
  function togglePicker(id:string){
    if(!pickerSel.includes(id)&&activeDay){
      const duplicate=findFiveDayDuplicate(id,activeDay,items.filter(x=>!(x.doctor_id===id&&x.planned_date===activeDay)));
      if(duplicate&&!confirm(`تنبيه: هذا الطبيب موجود في الخطة بتاريخ ${duplicate} خلال 5 أيام. هل تريد إضافته مرة أخرى؟`)) return;
    }
    setPickerSel(prev=> { if(prev.includes(id)){ setPickerMeta(meta=>{const next={...meta};delete next[id];return next}); return prev.filter(x=>x!==id); } setPickerMeta(meta=>({...meta,[id]:{product_id:"",priority:"medium",note:""}})); return [...prev,id]; });
  }
  function saveDay(){
    if(!activeDay) return;
    if(!pickerSel.length){ alert("اختر طبيب واحد على الأقل"); return; }
    setItemsByDay(prev=> ({...prev, [activeDay]: pickerSel.map(id=> ({doctor_id:id, product_id:pickerMeta[id]?.product_id||"", note:pickerMeta[id]?.note||"", priority:pickerMeta[id]?.priority||"medium"}))}));
    setPickerEditMode(false);
    setActiveDay(null);
  }
  function removeFromDay(date:string, doctorId:string){
    setItemsByDay(prev=>{
      const list=(prev[date]||[]).filter(x=> x.doctor_id!==doctorId);
      const next={...prev};
      if(list.length) next[date]=list; else delete next[date];
      return next;
    });
  }
  function clearAll(){
    setItemsByDay({});
  }

  async function createPlan(e:React.FormEvent){
    e.preventDefault();
    if(!items.length){ alert("أضف زيارة واحدة على الأقل — اضغط على يوم واختر أطباء"); return; }
    if(!start || !end){ alert("حدد تاريخ بداية الخطة"); return; }
    if(isAdmin && !adminPlanRepId){ alert("اختر المندوب أولا"); return; }
    const payload={period:planPeriod, period_start:start, period_end:end, items, target_visits: targetVisits, template_name: templateName, user_id:adminPlanRepId};
    const r=await fetch(editingPlanId?`/api/plans/${editingPlanId}`:"/api/plans",{method:editingPlanId?"PATCH":"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload)});
    const result=await r.json().catch(()=>null);
    if(!r.ok){ alert(result?.error||"فشل"); setReviewBusy(false); return; }
    if(result?.warnings?.length) alert(`تم حفظ الخطة مع التنبيهات:\n${result.warnings.join("\n")}`);
    if(isAdmin) setViewRepId(adminPlanRepId);
    setItemsByDay({}); setStart(""); setEnd(""); setEditingPlanId(null);
    load(); loadIQVIA();
  }

  async function suggestIQVIA(){
    if(!start){ alert("حدد بداية الخطة أولا"); return; }
    // The AI plan must cover at least nine visits per working day.
    const ds=workDays(start).map(d=>d.date);if(!ds.length)return;
    const suggestionTarget=Math.min(50,Math.max(1,targetVisits||10,ds.length*9));
    const selectedIds=Object.values(itemsByDay).flat().map(item=>item.doctor_id);
    const focusDoctor=doctors.find(doctor=>selectedIds.includes(doctor.id));
    const focusParams=new URLSearchParams({period:planPeriod,start,end:end||start,target:String(suggestionTarget),focusCity:focusDoctor?.city||"",focusClinic:focusDoctor?.clinic_name||""});
    const r=await fetch(`/api/plans/suggest?${focusParams.toString()}`).then(x=>x.json()).catch(()=>null);
    if(!r?.suggestions?.length){ alert("لا اقتراحات"); return; }
    // Keep doctors from the same clinic/area together, then prioritize A, B, C.
    const grouped=distributeSuggestionsByArea((r.suggestions as Array<{id:string;city?:string;clinic_name?:string;classification?:string}>).slice(0,suggestionTarget),ds);
    const next:Record<string, Array<{doctor_id:string; product_id:string; note:string; priority:string}>>={...itemsByDay};
    for(const date of ds){if(!next[date])next[date]=[];for(const suggestion of grouped[date]||[]){if(!next[date].some(x=>x.doctor_id===suggestion.id))next[date].push({doctor_id:suggestion.id,product_id:"",note:"",priority:"medium"});}}
    setItemsByDay(next);
  }

  async function applySavedTemplate(template:SavedTemplate){
    if(!templateCopyStart){ alert("اختر بداية الأسبوع الجديد أولا"); return; }
    const r=await fetch(`/api/plans/${template.id}`).then(x=>x.json()).catch(()=>null);
    if(!r?.plan){ alert("تعذر تحميل القالب"); return; }
    const sourceStart=String(r.plan.period_start).slice(0,10);
    const shifted=shiftPlanItems((r.items as Array<Record<string,unknown>>).map(row=>({doctor_id:String(row.doctor_id||""),planned_date:String(row.planned_date).slice(0,10),product_id:"",note:"",priority:"medium"})),sourceStart,templateCopyStart);
    const next:Record<string,Array<{doctor_id:string;product_id:string;note:string;priority:string}>>={};
    for(const row of shifted){if(!next[row.planned_date])next[row.planned_date]=[];next[row.planned_date].push({doctor_id:row.doctor_id,product_id:"",note:"",priority:"medium"});}
    setEditingPlanId(null); setPlanPeriod((String(r.plan.period) as PlanPeriod) || "weekly"); setStart(templateCopyStart); setTargetVisits(Number(r.plan.target_visits||shifted.length||1)); setTemplateName(template.name); setItemsByDay(next); setTemplateCopyStart("");
    if(isAdmin){setAdminPlanRepId(String(r.plan.user_id));setViewRepId(String(r.plan.user_id));}
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function openDetail(plan:Plan){
    const response=await fetch(`/api/plans/${plan.id}`); const r=await response.json().catch(()=>null);
    if(!response.ok||!r?.plan){alert(r?.error||"تعذر تحميل تفاصيل الخطة");return;} setDetail(r);
  }
  useEffect(()=>{if(!initialPlanId||deepLinkOpened)return;setDeepLinkOpened(true);fetch(`/api/plans/${initialPlanId}`).then(async response=>({ok:response.ok,data:await response.json().catch(()=>null)})).then(({ok,data})=>{if(ok&&data?.plan){setDetail(data);if(isAdmin)setViewRepId(String(data.plan.user_id||""));}else alert(data?.error||"تعذر فتح الخطة المطلوبة")}).catch(()=>alert("تعذر فتح الخطة المطلوبة"));},[initialPlanId,deepLinkOpened,isAdmin]);
  async function adminAction(id:string, status:string){
    if(reviewBusy)return; setReviewBusy(true);
    try{
      const note = status==="rejected" || status==="needs_revision" ? prompt("ملاحظة للمدير (اختياري)")||"" : adminNote;
      const r=await fetch(`/api/plans/${id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({status, admin_note:note})});
      const result=await r.json().catch(()=>null);
      if(!r.ok){ alert(result?.error||"فشل"); return; }
      await load(); if(detail){ const rr=await fetch(`/api/plans/${id}`).then(x=>x.json()); setDetail(rr); }
    }catch{alert("تعذر الاتصال بالخادم، حاول مرة أخرى");}finally{setReviewBusy(false);}
  }
  function startAdminEdit(){
    if(!detail) return;
    const p=detail.plan as Record<string,unknown>;
    setEditingPlanId(String(p.id)); setPlanPeriod((String(p.period) as PlanPeriod) || "weekly"); setAdminPlanRepId(String(p.user_id)); setViewRepId(String(p.user_id));
    setStart(String(p.period_start).slice(0,10)); setEnd(String(p.period_end).slice(0,10)); setTargetVisits(Number(p.target_visits||detail.items.length||1)); setTemplateName(String(p.template_name||""));
    const next:Record<string,Array<{doctor_id:string;product_id:string;note:string;priority:string}>>={};
    for(const row of detail.items as Array<Record<string,unknown>>){ const date=String(row.planned_date).slice(0,10); if(!next[date])next[date]=[]; next[date].push({doctor_id:String(row.doctor_id||""),product_id:String(row.product_id||""),note:String(row.note||""),priority:String(row.priority||"medium")}); }
    setItemsByDay(next); setDetail(null); window.scrollTo({top:0,behavior:"smooth"});
  }
  function prepareCopy(){
    if(!detail||!copyStart){alert("اختر تاريخ بداية الأسبوع الجديد");return;}
    const sourceStart=String(detail.plan.period_start).slice(0,10);
    const shifted=shiftPlanItems((detail.items as Array<Record<string,unknown>>).map(row=>({doctor_id:String(row.doctor_id||""),planned_date:String(row.planned_date).slice(0,10),product_id:"",note:"",priority:"medium"})),sourceStart,copyStart);
    const next:Record<string,Array<{doctor_id:string;product_id:string;note:string;priority:string}>>={};
    for(const row of shifted){if(!next[row.planned_date])next[row.planned_date]=[];next[row.planned_date].push({doctor_id:row.doctor_id,product_id:"",note:"",priority:"medium"});}
    setEditingPlanId(null);setPlanPeriod((String(detail.plan.period) as PlanPeriod) || "weekly");setStart(copyStart);setTargetVisits(Number(detail.plan.target_visits||shifted.length||1));setTemplateName(String(detail.plan.template_name||"")+" - نسخة");setItemsByDay(next);
    if(isAdmin){setAdminPlanRepId(String(detail.plan.user_id));setViewRepId(String(detail.plan.user_id));}
    setDetail(null);setCopyStart("");window.scrollTo({top:0,behavior:"smooth"});
  }
  async function requestRevision(){
    if(!detail||!editNote.trim()){ alert("اكتب سبب التعديل"); return; }
    const body={ note: editNote, items: (detail.items as Array<Record<string,unknown>>).map(i=> ({doctor_id: String((i as Record<string,unknown>).did || (i as Record<string,unknown>).doctor_id||""), planned_date: String(i.planned_date).slice(0,10), product_id: String((i as Record<string,unknown>).prod_id || (i as Record<string,unknown>).product_id||""), note: String(i.note||""), priority: String(i.priority||"medium")})) };
    const r=await fetch(`/api/plans/${String(detail.plan.id)}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(body)});
    if(!r.ok){ const j=await r.json().catch(()=>null); alert(j?.error||"فشل"); return; }
    setEditNote(""); load(); const rr=await fetch(`/api/plans/${String(detail.plan.id)}`).then(x=>x.json()); setDetail(rr);
  }

  return (
    <div className="mt-4 space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-l from-slate-950 via-[var(--navy)] to-sky-900 p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="mb-2 text-xs font-bold text-sky-200">{isAdmin?"مركز قيادة الخطط":"مساعد تخطيط الزيارات"}</div><h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{isAdmin?"راجع، اعتمد وتابع تنفيذ كل الخطط من مكان واحد":"رتّب أسبوعك بوضوح وركّز على الأطباء الأعلى أولوية"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">{isAdmin?"ابدأ بالمعلّق، تابع التغطية والالتزام، ثم راقب التنفيذ الفعلي لكل مندوب.":"اختر الفترة، وزّع الأطباء على الأيام، اربط المنتجات ثم أرسل الخطة للمراجعة."}</p></div><button onClick={()=>setWorkspaceTab("builder")} className="min-h-12 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-[var(--navy)] shadow-sm transition hover:bg-sky-50">{isAdmin?"+ إنشاء خطة لمندوب":"+ إنشاء خطة جديدة"}</button></div>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5"><div className="rounded-2xl border border-white/10 bg-white/10 p-3"><div className="text-xs text-white/60">إجمالي الخطط</div><div className="mt-1 text-2xl font-extrabold">{planSummary.total}</div></div><div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3"><div className="text-xs text-amber-100/80">بانتظار المراجعة</div><div className="mt-1 text-2xl font-extrabold text-amber-200">{planSummary.pending}</div></div><div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3"><div className="text-xs text-emerald-100/80">معتمدة</div><div className="mt-1 text-2xl font-extrabold text-emerald-200">{planSummary.approved}</div></div><div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3"><div className="text-xs text-sky-100/80">تحتاج تعديل</div><div className="mt-1 text-2xl font-extrabold text-sky-200">{planSummary.needs_revision}</div></div><div className="col-span-2 rounded-2xl border border-white/10 bg-white/10 p-3 lg:col-span-1"><div className="text-xs text-white/60">زيارات مخططة</div><div className="mt-1 text-2xl font-extrabold">{planSummary.planned_visits}</div></div></div>
      </section>
      <nav className="sticky top-2 z-30 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white/95 p-1.5 shadow-sm backdrop-blur"><div className="flex min-w-max gap-1">{workspaceTabs.map(tab=><button key={tab.id} onClick={()=>{setWorkspaceTab(tab.id);if(tab.id==="review"){setFilter("pending");setViewRepId("");}if(tab.id==="plans"||tab.id==="overview"){setFilter("");setViewRepId("");}if(tab.id==="execution"){void loadExecution();}}} className={`min-h-11 rounded-xl px-4 py-2 text-right transition ${workspaceTab===tab.id?"bg-[var(--navy)] text-white shadow-sm":"text-slate-600 hover:bg-slate-100"}`}><span className="block text-sm font-extrabold">{tab.label}</span><span className={`block text-[10px] ${workspaceTab===tab.id?"text-white/60":"text-[var(--muted)]"}`}>{tab.hint}</span></button>)}</div></nav>
      {loadError&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>تعذر تحديث بيانات الخطط: {loadError}</span><Button variant="outline" onClick={load}>إعادة المحاولة</Button></div>}
      {workspaceTab==="overview"&&<>
      <div className="grid gap-4 lg:grid-cols-3"><Card className="p-4 lg:col-span-2"><div className="flex items-center justify-between gap-3"><div><div className="font-extrabold text-[var(--navy)]">{isAdmin?"أولوية العمل الآن":"حالة خططك"}</div><div className="text-xs text-[var(--muted)]">{isAdmin?"ابدأ بالخطط المعلقة قبل متابعة التنفيذ":"اعرف أين وصلت كل خطة وما الخطوة التالية"}</div></div><button onClick={()=>{setWorkspaceTab(isAdmin?"review":"plans");if(isAdmin)setFilter("pending")}} className="rounded-xl border px-3 py-2 text-xs font-bold">عرض الكل</button></div><div className="mt-3 space-y-2">{plans.filter(p=>isAdmin?p.status==="pending":true).slice(0,5).map(p=><button key={p.id} onClick={()=>openDetail(p)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-slate-50 p-3 text-right transition hover:border-sky-300 hover:bg-sky-50"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.status==="pending"?"bg-amber-500":p.status==="approved"?"bg-emerald-500":p.status==="needs_revision"?"bg-sky-500":"bg-red-500"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{isAdmin?`${p.user_name} — `:""}{planPeriodLabel(p.period)} · {p.items_count} زيارة</span><span className="block text-[11px] text-[var(--muted)]">{new Date(p.period_start).toLocaleDateString("ar-EG")} ← {statusLabel[p.status]||p.status}</span></span><span className="text-xs font-bold text-sky-800">فتح ←</span></button>)}{!plans.filter(p=>isAdmin?p.status==="pending":true).length&&<div className="rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--muted)]">{isAdmin?"لا توجد خطط معلقة الآن":"لم تنشئ خططًا بعد"}</div>}</div></Card><Card className="p-4"><div className="font-extrabold text-[var(--navy)]">خطوات العمل</div><div className="mt-3 space-y-3">{(isAdmin?["راجع تفاصيل الخطة والتغطية","اعتمد أو اطلب تعديلًا واضحًا","تابع التنفيذ والفائت يوميًا"]:["حدد الفترة وبداية الخطة","وزّع الأطباء واربط المنتجات","راجع العدد ثم أرسل للأدمن"]).map((step,index)=><div key={step} className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-extrabold text-white">{index+1}</span><span className="pt-1 text-sm font-semibold">{step}</span></div>)}</div></Card></div>
      <details className="group rounded-2xl border border-[var(--border)] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div>
            <div className="font-extrabold text-[var(--navy)]">تحليلات تفصيلية</div>
            <div className="text-xs text-[var(--muted)]">تردد الزيارات حسب التصنيف، التغطية الشهرية، والالتزام</div>
          </div>
          <span className="text-xs font-bold text-[var(--sky-deep)] transition group-open:rotate-180">▾ عرض</span>
        </summary>
        <div className="space-y-3 border-t border-[var(--border)] p-4 pt-3">
      {isAdmin && frequencies.length>0 && (
        <Card className="p-4">
          <div className="font-bold text-sm mb-2">إعدادات IQVIA — Frequency (زيارة / شهر)</div>
          <div className="flex gap-2 flex-wrap">
            {frequencies.map(f=>(
              <div key={f.classification} className="flex items-center gap-1 text-sm">
                <span className="font-bold w-6">{f.classification}</span>
                <Input type="number" value={f.visits_per_month} onChange={e=>{
                  const v=parseInt(e.target.value||"0",10);
                  setFrequencies(frequencies.map(x=> x.classification===f.classification? {...x, visits_per_month:v}:x));
                }} className="w-16 h-8 text-center" min={0} max={30} />
                <span className="text-xs text-[var(--muted)]">/شهر</span>
              </div>
            ))}
            <Button variant="outline" onClick={async()=>{
              await fetch("/api/plans/frequencies",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({frequencies})});
              alert("تم الحفظ");
              const c=await fetch("/api/plans/coverage").then(x=>x.json()).catch(()=>null);
              if(c) setCoverage(c.coverage||[]);
            }} className="text-xs">حفظ</Button>
          </div>
        </Card>
      )}
      {coverage.length>0 && (
        <Card className="p-4">
          <div className="font-bold text-sm mb-2">Coverage — الشهر الميلادي الحالي (بتوقيت الرياض){isAdmin&&viewRepId?` — ${reps.find((r:any)=>r.id===viewRepId)?.name||"المندوب المحدد"}`:""}</div>
          <div className="grid grid-cols-3 gap-2">
            {coverage.map(c=>(
              <div key={c.classification} className={`rounded-xl border p-3 text-center ${c.coverage>=80? "bg-emerald-50 border-emerald-200": c.coverage>=50? "bg-amber-50 border-amber-200":"bg-red-50 border-red-200"}`}>
                <div className="text-lg font-extrabold">{c.coverage}%</div>
                <div className="text-xs font-bold">{c.classification} — {c.freq}/شهر</div>
                <div className="text-[11px] text-[var(--muted)]">{c.doctors} طبيب — متوقع {c.expected} — خططت {c.planned}</div>
                <div className="mt-1 h-1.5 bg-white rounded-full overflow-hidden border"><div className={`h-full ${c.coverage>=80? "bg-emerald-600": c.coverage>=50? "bg-amber-500":"bg-red-500"}`} style={{width:`${Math.min(100,c.coverage)}%`}} /></div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {isAdmin && compliance.length>0 && (
        <Card className="p-4">
          <div className="font-bold text-sm mb-2">Compliance</div>
          <div className="space-y-2">
            {compliance.map(c=>(
              <div key={c.user_id} className="flex items-center gap-2 text-sm">
                <span className="w-28 font-semibold truncate">{c.name}</span>
                <div className="flex-1 h-3 bg-[var(--border)] rounded-full overflow-hidden"><div className={`h-full ${c.adherence>=80? "bg-emerald-600": c.adherence>=50? "bg-amber-500":"bg-red-500"}`} style={{width:`${c.adherence}%`}} /></div>
                <span className="w-20 text-xs font-bold">{c.adherence}% ({c.totalDone}/{c.totalPlanned})</span>
              </div>
            ))}
          </div>
        </Card>
      )}
        </div>
      </details>

      </>}

      {workspaceTab==="builder"&&<>
      {templates.length>0 && <Card className="p-4 bg-sky-50/60 border-sky-200">
        <div className="font-extrabold text-sm mb-2">قوالب الخطط المحفوظة</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]"><Label>بداية الأسبوع الجديد</Label><Input type="date" value={templateCopyStart} onChange={e=>setTemplateCopyStart(e.target.value)} /></div>
          <div className="flex-1 min-w-[260px]"><Label>اختر خطة محفوظة</Label><Select defaultValue="" onChange={e=>{const t=templates.find(x=>x.id===e.target.value);if(t)applySavedTemplate(t)}}><option value="">اختر قالبًا لاستخدامه</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} — {new Date(t.period_start).toLocaleDateString("ar-EG")}</option>)}</Select></div>
        </div>
        <div className="text-xs text-[var(--muted)] mt-2">منشئ الخطط الحالي أسبوعي؛ يمكن عرض الخطط الشهرية القديمة من فلتر الفترات.</div>
      </Card>}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold">{editingPlanId?`تعديل الخطة ${planPeriodLabel(planPeriod)}`:`خطة ${planPeriodLabel(planPeriod)} جديدة`} — اضغط على اليوم واختر الأطباء</span>
          <span className="text-xs text-[var(--muted)]">{items.length} زيارة</span>
        </div>
        {editingPlanId&&<div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex justify-between items-center"><span className="text-sm font-bold text-amber-800">وضع التعديل فعال — يمكن للمدير تعديل الخطة حتى بعد اعتمادها</span><Button type="button" variant="outline" onClick={()=>{setEditingPlanId(null);setItemsByDay({});setStart("");setEnd("")}}>إلغاء التعديل</Button></div>}
        <form onSubmit={createPlan} className="space-y-3">
          <div className={`grid ${isAdmin?"md:grid-cols-5":"md:grid-cols-4"} gap-3`}>
            <div className="space-y-1.5"><Label>نوع الخطة</Label><Select value={planPeriod} onChange={e=>{setPlanPeriod(e.target.value as PlanPeriod);setItemsByDay({});setStart("");setEnd("")}} disabled={!!editingPlanId}>{PLAN_PERIODS.map(p=><option key={p} value={p}>{planPeriodLabel(p)}</option>)}</Select></div>
            {isAdmin&&<div className="space-y-1.5"><Label>المندوب *</Label><Select value={adminPlanRepId} onChange={e=>setAdminPlanRepId(e.target.value)} disabled={!!editingPlanId}><option value="">اختر المندوب</option>{reps.filter((r:any)=>representativeCanReceivePlan(r.active)).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>}
            <div className="space-y-1.5"><Label>بداية الخطة</Label><Input type="date" value={start} onChange={e=>setStart(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>نهاية الخطة (تلقائي)</Label><Input type="date" value={end} readOnly className="bg-[var(--bg)]" /></div>
            {isAdmin && <div className="space-y-1.5"><Label>هدف الزيارات</Label><Input type="number" value={targetVisits} onChange={e=>setTargetVisits(parseInt(e.target.value||"0",10))} min={1} /></div>}
          </div>
          <div className="space-y-1.5"><Label>اسم الخطة / القالب (اختياري)</Label><Input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="مثال: خطة الخبر الأسبوعية" /></div>

          {!start ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">حدد بداية الأسبوع لعرض التقويم</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {days.map(d=>{
                const isOff=d.weekend || !!d.holiday;
                const list=itemsByDay[d.date]||[];
                return (
                  <button key={d.date} type="button" disabled={isOff} onClick={()=> openDay(d.date)} className={`rounded-2xl border-2 p-3 text-right flex flex-col gap-1 min-h-[120px] transition ${isOff? "bg-zinc-100 border-zinc-200 opacity-60 cursor-not-allowed": list.length? "bg-sky-50 border-sky-300 shadow-sm":"bg-white border-[var(--border)] hover:border-sky-200 hover:bg-sky-50/50"}`}>
                    <span className="text-xs text-[var(--muted)]">{d.weekday} {isOff? (d.holiday? "— إجازة":"— إجازة"): ""}</span>
                    <span className={`font-extrabold text-sm ${isOff? "line-through text-zinc-400":""}`}>{d.label}</span>
                    <span className="text-[11px] text-[var(--muted)]">{d.date}{d.holiday? ` — ${d.holiday}`:""}</span>
                    {list.length ? (
                      <div className="mt-1 space-y-1 w-full">
                        <span className="inline-flex bg-[var(--navy)] text-white rounded-full px-2 py-0.5 text-[11px] font-bold">{list.length} طبيب</span>
                        {list.slice(0,3).map((it,idx)=>(
                          <span key={idx} className="block truncate text-[11px] bg-white border border-sky-200 rounded-lg px-1.5 py-0.5" onClick={e=>{e.stopPropagation(); removeFromDay(d.date, it.doctor_id);}}>
                            {doctors.find(x=>x.id===it.doctor_id)?.name||it.doctor_id}
                          </span>
                        ))}
                        {list.length>3 && <span className="block text-[10px] text-[var(--muted)]">+{list.length-3} آخرين</span>}
                      </div>
                    ) : (
                      <span className="mt-auto text-xs text-sky-600 font-bold">+ اضغط للاختيار</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={suggestIQVIA} className="flex-1 bg-sky-50 border-sky-200">اقتراح AI</Button>
            <Button type="button" variant="outline" onClick={clearAll} className="text-red-600">مسح الكل</Button>
          </div>

          {items.length>0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2 space-y-1 max-h-[140px] overflow-auto">
              {items.map((it,i)=>(
                <div key={i} className="flex items-center gap-2 text-xs bg-white border border-[var(--border)] rounded-xl px-2 py-1">
                  <span className="font-bold text-sky-700 shrink-0">{new Date(it.planned_date).toLocaleDateString("ar-EG",{weekday:"short", day:"numeric"})}</span>
                  <span className="flex-1 truncate">{doctors.find(d=>d.id===it.doctor_id)?.name||it.doctor_id} <span className="text-[var(--muted)]">— {prioLabel[it.priority]||it.priority}</span></span>
                  <button type="button" onClick={()=> removeFromDay(it.planned_date, it.doctor_id)} className="text-red-600 px-1">×</button>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full py-3 text-base inline-flex items-center justify-center gap-1.5">{editingPlanId?<>حفظ تعديلات الخطة {planPeriodLabel(planPeriod)} <Icon name="check" size={16} /></>:isAdmin?`إنشاء خطة ${planPeriodLabel(planPeriod)} معتمدة للمندوب`:<>إرسال الخطة {planPeriodLabel(planPeriod)} للموافقة <Icon name="check" size={16} /></>}</Button>
          {!isAdmin && <div className="text-xs text-[var(--muted)] text-center">سيتم إرسالها للمدير — أي تعديل لاحق يحتاج موافقة جديدة</div>}
        </form>
      </Card>
      </>}

      {(workspaceTab==="plans"||workspaceTab==="review")&&<>
      {isAdmin&&<Card className="p-4"><div className="flex items-center justify-between gap-2"><div className="font-extrabold text-sm">خطط المناديب — اختر مندوبًا أو اعرض الجميع</div><button onClick={()=>setViewRepId("")} className={`rounded-xl px-3 py-2 text-xs font-bold ${!viewRepId?"bg-[var(--navy)] text-white":"border"}`}>كل المناديب</button></div><div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{reps.map((r:any)=>{const stats=repPlanSummary.find(x=>x.id===r.id);const count=stats?.total||0,pending=stats?.pending||0;return <button key={r.id} onClick={()=>{setViewRepId(r.id);if(!editingPlanId&&representativeCanReceivePlan(r.active))setAdminPlanRepId(r.id)}} className={`rounded-2xl border p-3 text-right transition ${viewRepId===r.id?"bg-[var(--navy)] text-white border-[var(--navy)] shadow-md":"bg-white border-[var(--border)] hover:border-sky-300"}`}><div className="flex items-center gap-2 font-extrabold">{r.name}{!representativeCanReceivePlan(r.active)&&<span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">موقوف</span>}</div><div className={`text-xs mt-1 ${viewRepId===r.id?"text-white/60":"text-[var(--muted)]"}`}>{count} خطة {pending>0?`— ${pending} تحتاج موافقة`:""}</div></button>})}</div></Card>}

      </>}

      {workspaceTab==="execution"&&<Card className="p-4 border-sky-200 bg-sky-50/50">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-extrabold text-lg text-[var(--navy)]">تقويم تنفيذ الخطط</div><div className="text-xs text-[var(--muted)]">آخر 30 يومًا من تاريخ البداية — التنفيذ محسوب من الزيارات المكتملة أو المتابعات.</div></div><Button variant="outline" disabled={executionLoading} onClick={()=>void loadExecution()}>{executionLoading?"جاري التحديث…":"تحديث التنفيذ"}</Button></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white p-3 text-center"><div className="text-2xl font-extrabold">{executionSummary.planned}</div><div className="text-xs text-[var(--muted)]">مخططة</div></div><div className="rounded-xl bg-emerald-50 p-3 text-center"><div className="text-2xl font-extrabold text-emerald-700">{executionSummary.done}</div><div className="text-xs text-emerald-800">منفذة</div></div><div className="rounded-xl bg-red-50 p-3 text-center"><div className="text-2xl font-extrabold text-red-700">{executionSummary.missed}</div><div className="text-xs text-red-800">فائتة</div></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{Object.entries(executionRows.reduce((groups:Record<string,Array<Record<string,unknown>>>,row)=>{const key=String(row.planned_date);(groups[key]||(groups[key]=[])).push(row);return groups},{})).sort(([a],[b])=>a.localeCompare(b)).map(([day,rows])=><div key={day} className="rounded-2xl border bg-white p-3"><div className="mb-2 flex items-center justify-between"><div className="font-extrabold text-[var(--navy)]">{new Date(day+"T12:00:00").toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"short"})}</div><Badge tone={rows.every(r=>r.done)?"success":"warn"}>{rows.filter(r=>r.done).length}/{rows.length}</Badge></div><div className="space-y-2">{rows.map(row=><div key={String(row.id)} className={`rounded-xl border p-2 ${row.done?"border-emerald-200 bg-emerald-50/60":"border-amber-200 bg-amber-50/40"}`}><div className="flex items-start gap-2"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${row.done?"bg-emerald-600 text-white":"border bg-white"}`}>{row.done?<Icon name="check" size={12} />:<Icon name="circle" size={12} />}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{String(row.doctor_name||"")}</div><div className="truncate text-[11px] text-[var(--muted)]">{String(row.product_name||"بدون منتج")} · {String(row.clinic_name||"")}</div></div>{!isAdmin&&!row.done&&<a href={`/visits/new?doctorId=${String(row.doctor_id||"")}${row.product_id?`&productId=${String(row.product_id)}`:""}`} className="text-[11px] font-bold text-sky-800">زيارة ←</a>}</div></div>)}</div></div>)}{!executionRows.length&&!executionLoading&&<div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-[var(--muted)] md:col-span-2 lg:col-span-3">لا توجد زيارات مخططة في هذه الفترة.</div>}</div>
      </Card>}

      {(workspaceTab==="plans"||workspaceTab==="review")&&<>
      <Card className="p-3"><div className="flex flex-col gap-2 lg:flex-row"><input value={planSearch} onChange={e=>setPlanSearch(e.target.value)} placeholder="ابحث بالمندوب أو الحالة أو الملاحظة" className="min-h-11 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm"/><div className="flex flex-wrap gap-2">
        <select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <option value="">كل الحالات</option><option value="draft">مسودة</option><option value="pending">بانتظار الموافقة</option><option value="approved">معتمدة</option><option value="rejected">مرفوضة</option><option value="needs_revision">تحتاج تعديل</option>
        </select>
        <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"><option value="">كل الفترات</option><option value="daily">يومية</option><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option></select>
        <Button variant="outline" onClick={load}>تحديث</Button><Button variant="outline" onClick={()=>{setWorkspaceTab("execution");void loadExecution()}}>متابعة التنفيذ</Button></div></div>
      </Card>

      <div className="grid gap-3">
        {visiblePlans.map(p=>(
          <div key={p.id} onClick={()=>openDetail(p)} className="rounded-2xl bg-white border border-[var(--border)] shadow-sm p-4 cursor-pointer hover:shadow-md transition">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold"> {planPeriodLabel(p.period)} — {new Date(p.period_start).toLocaleDateString("ar-EG")} → {new Date(p.period_end).toLocaleDateString("ar-EG")}</span>
                  <Badge tone={statusTone[p.status]||"neutral"}>{statusLabel[p.status]||p.status}</Badge>
                  <span className="text-xs text-[var(--muted)]">{p.items_count} زيارة</span>{p.target_visits ? <Badge tone="info">الهدف: {p.target_visits}</Badge> : !isAdmin ? <span className="text-xs text-[var(--muted)]">الهدف يحدده المدير</span> : null}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">{isAdmin? `المندوب: ${p.user_name}`:""} {p.admin_note? `— ${p.admin_note}`:""}</div>
                {p.target_visits&&<div className="mt-2 max-w-sm"><div className="mb-1 flex justify-between text-[10px] text-[var(--muted)]"><span>تغطية الهدف</span><span>{planTargetProgress(p.items_count,p.target_visits)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-600" style={{width:`${planTargetProgress(p.items_count,p.target_visits)}%`}} /></div></div>}
              </div>
              <span className="text-xs text-[var(--muted)]">{new Date(p.created_at).toLocaleDateString("ar-EG")}</span>
            </div>
          </div>
        ))}
        {visiblePlans.length===0 && <div className="rounded-2xl bg-white border border-[var(--border)] shadow-sm p-8 text-center text-[var(--muted)]">لا توجد خطط مطابقة للفلاتر الحالية</div>}
      </div>
      </>}

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-auto">
          <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-[var(--border)] p-4 flex items-center justify-between">
              <span className="font-bold">تفاصيل الخطة</span>
              <button onClick={()=>setDetail(null)} className="h-8 w-8 rounded-full border">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2 flex-wrap"><Badge tone={statusTone[String(detail.plan.status)]||"neutral"}>{statusLabel[String(detail.plan.status)]||String(detail.plan.status)}</Badge>{isAdmin&&<Badge tone="info">المندوب: {String(detail.plan.user_name||"")}</Badge>}<span className="text-xs text-[var(--muted)]">{new Date(String(detail.plan.period_start)).toLocaleDateString("ar-EG")} → {new Date(String(detail.plan.period_end)).toLocaleDateString("ar-EG")}</span>{detail.plan.target_visits ? <Badge tone="info">الهدف: {String(detail.plan.target_visits)}</Badge> : !isAdmin ? <span className="text-xs text-[var(--muted)]">الهدف يحدده المدير</span> : null}</div>
              {detail.plan.admin_note && <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-sm">{String(detail.plan.admin_note)}</div>}
              <div className="space-y-3">
                {detailDays.map(([date,dayItems])=><section key={date} className="rounded-2xl border border-[var(--border)] overflow-hidden"><div className="bg-[var(--navy)] text-white px-3 py-2 text-sm font-extrabold">{new Date(date+"T12:00:00").toLocaleDateString("ar-EG",{weekday:"long",day:"numeric",month:"long"})}</div><div className="p-2 space-y-1">{dayItems.map((it,idx)=><div key={idx} className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-sm ${it.done?"bg-emerald-50 border-emerald-200":"bg-white border-[var(--border)]"}`}><span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${it.done?"bg-emerald-600 text-white":"bg-white border"}`}>{it.done?<Icon name="check" size={12} />:<Icon name="circle" size={12} />}</span><div className="flex-1"><div className="font-semibold">{String(it.doctor_name||"")}</div><div className="text-xs text-[var(--muted)]">{String(it.clinic_name||"")} — {String(it.doctor_city||"")}{it.product_name?` · المنتج: ${String(it.product_name)}`:""}</div></div>{!isAdmin&&!it.done&&<a href={`/visits/new?doctorId=${String(it.doctor_id||"")}${it.product_id?`&productId=${String(it.product_id)}`:""}`} className="rounded-lg border px-2 py-1 text-[11px] font-bold text-sky-800">تسجيل الزيارة</a>}</div>)}</div></section>)}
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href={`/api/exports/plans?id=${String(detail.plan.id)}&format=xlsx`} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold">Excel</a>
                <a href={`/api/exports/plans?id=${String(detail.plan.id)}&format=csv`} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold">CSV</a>
                {isAdmin&&<Button onClick={startAdminEdit} className="!py-1.5">تعديل الخطة</Button>}
              </div>
              {String(detail.plan.period)==="weekly"&&<div className="rounded-xl bg-sky-50 border border-sky-200 p-3"><div className="font-bold text-sm">عمل نسخة من الخطة لأسبوع آخر</div><div className="flex gap-2 mt-2"><Input type="date" value={copyStart} onChange={e=>setCopyStart(e.target.value)} className="flex-1"/><Button onClick={prepareCopy}>تجهيز النسخة</Button></div><div className="text-[11px] text-[var(--muted)] mt-1">سيتم نقل نفس الأطباء إلى الأيام المقابلة ويمكنك مراجعتها قبل الإرسال.</div></div>}
              <div>
                <div className="font-bold text-sm mb-1">تعليقات</div>
                <div className="space-y-1 max-h-[120px] overflow-auto">
                  {detail.comments.map(c=>(
                    <div key={c.id} className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-2"><div className="text-xs font-bold">{c.user_name} <span className="text-[var(--muted)] font-normal">{new Date(c.created_at).toLocaleString("ar-EG")}</span></div><div className="text-sm whitespace-pre-wrap">{c.body}</div></div>
                  ))}
                  {detail.comments.length===0 && <div className="text-xs text-[var(--muted)]">لا تعليقات</div>}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input value={commentBody} onChange={e=>setCommentBody(e.target.value)} placeholder="اكتب تعليقا..." className="flex-1" onKeyDown={e=>{if(e.key==="Enter"&&commentBody.trim()){(async()=>{await fetch(`/api/plans/${String(detail.plan.id)}/comments`,{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({body:commentBody})}); setCommentBody(""); const r=await fetch(`/api/plans/${String(detail.plan.id)}`).then(x=>x.json()); setDetail(r);})()}}} />
                  <Button variant="outline" onClick={async()=>{ if(!commentBody.trim()) return; await fetch(`/api/plans/${String(detail.plan.id)}/comments`,{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({body:commentBody})}); setCommentBody(""); const r=await fetch(`/api/plans/${String(detail.plan.id)}`).then(x=>x.json()); setDetail(r);}}>إرسال</Button>
                </div>
              </div>
              {isAdmin && canAdminReviewPlan(detail.plan.status) && (
                <div className="space-y-2">
                  <div className="font-bold text-sm">إجراءات المدير</div>
                  <Textarea value={adminNote} onChange={e=>setAdminNote(e.target.value)} placeholder="ملاحظة" rows={2} />
                  <div className="flex gap-2">
                    <Button disabled={reviewBusy} onClick={()=>adminAction(String(detail.plan.id),"approved")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 inline-flex items-center justify-center gap-1.5">موافقة <Icon name="check" size={16} /></Button>
                    <Button disabled={reviewBusy} variant="outline" onClick={()=>adminAction(String(detail.plan.id),"needs_revision")} className="flex-1">طلب تعديل</Button>
                    <Button disabled={reviewBusy} variant="outline" onClick={()=>adminAction(String(detail.plan.id),"rejected")} className="flex-1 border-red-200 text-red-700">رفض</Button>
                  </div>
                </div>
              )}
              {!isAdmin && (
                <div className="space-y-2">
                  <div className="font-bold text-sm">طلب تعديل</div>
                  <Textarea value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="سبب التعديل..." rows={2} />
                  <Button variant="outline" onClick={requestRevision} className="w-full">إرسال</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeDay && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-[520px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
              <span className="font-bold">{new Date(activeDay).toLocaleDateString("ar-EG",{weekday:"long", day:"numeric", month:"long"})} — {activeDay}</span>
              <div className="flex items-center gap-2">
                {!pickerEditMode && <Button type="button" variant="primary" className="!px-4 !py-2 text-sm shadow-md ring-2 ring-[var(--gold)]/30" onClick={()=>setPickerEditMode(true)} ><span className="inline-flex items-center gap-1.5"><Icon name="edit" size={14} /> تعديل الأطباء</span></Button>}
                <button onClick={()=> setActiveDay(null)} className="h-8 w-8 rounded-full border">×</button>
              </div>
            </div>
            <div className="p-4 space-y-3 overflow-auto flex-1">
              {pickerEditMode ? <>
                <Input value={pickerQ} onChange={e=>setPickerQ(e.target.value)} placeholder="ابحث باسم الطبيب أو العيادة..." />
                <div className="rounded-xl border border-[var(--border)] divide-y max-h-[360px] overflow-auto">
                  {filteredDoctors.map(d=>{
                    const isSel=pickerSel.includes(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isSel? "bg-sky-50":""}`}>
                        <input type="checkbox" checked={isSel} onChange={()=> togglePicker(d.id)} />
                        <span className="flex-1 text-sm">{d.name} — <span className="text-[var(--muted)] text-xs">{d.clinic_name} ({d.city})</span></span>
                        <Badge tone={d.classification==="A"?"success":d.classification==="B"?"info":"neutral"}>Class {d.classification||"—"}</Badge>
                        <span className={`h-5 w-5 rounded border flex items-center justify-center text-[10px] shrink-0 ${isSel? "bg-[var(--navy)] text-white border-[var(--navy)]":"bg-white"}`}>{isSel? <Icon name="check" size={12} />:null}</span>
                      </label>
                    );
                  })}
                  {filteredDoctors.length===0 && <div className="p-3 text-xs text-[var(--muted)] text-center">لا نتائج</div>}
                </div>
              </> : <div className="rounded-xl border border-[var(--border)] divide-y max-h-[360px] overflow-auto">
                {doctors.filter(d=>pickerSel.includes(d.id)).map(d=><div key={d.id} className="space-y-2 px-3 py-2">
                  <div className="flex items-center gap-2"><div className="flex-1 text-sm">{d.name} — <span className="text-[var(--muted)] text-xs">{d.clinic_name} ({d.city})</span></div><Badge tone={d.classification==="A"?"success":d.classification==="B"?"info":"neutral"}>Class {d.classification||"—"}</Badge><button type="button" onClick={()=>togglePicker(d.id)} className="text-xs text-red-600 font-bold">إزالة</button></div>
                  <div className="grid grid-cols-2 gap-2"><Select value={pickerMeta[d.id]?.product_id||""} onChange={e=>setPickerMeta(meta=>({...meta,[d.id]:{...(meta[d.id]||{priority:"medium",note:""}),product_id:e.target.value}}))}><option value="">بدون منتج محدد</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</Select><Select value={pickerMeta[d.id]?.priority||"medium"} onChange={e=>setPickerMeta(meta=>({...meta,[d.id]:{...(meta[d.id]||{product_id:"",note:""}),priority:e.target.value}}))}><option value="low">أولوية منخفضة</option><option value="medium">أولوية متوسطة</option><option value="high">أولوية عالية</option><option value="urgent">عاجلة</option></Select></div>
                </div>)}
                {pickerSel.length===0 && <div className="p-4 text-xs text-[var(--muted)] text-center">لا يوجد أطباء محددون — اضغط تعديل للاختيار</div>}
              </div>}
              <div className="text-xs text-[var(--muted)]">{pickerSel.length} طبيب محدد</div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex gap-2">
              <Button variant="outline" onClick={()=> setActiveDay(null)} className="flex-1">إلغاء</Button>
              <Button onClick={saveDay} className="flex-1 inline-flex items-center justify-center gap-1.5">حفظ لليوم <Icon name="check" size={15} /> ({pickerSel.length})</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
