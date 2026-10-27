const DAY=86_400_000;
function dateMs(value:string){return Date.parse(`${value.slice(0,10)}T00:00:00Z`)}
export function dateRangesOverlap(startA:string,endA:string,startB:string,endB:string){return startA<=endB&&startB<=endA}
export function findFiveDayDuplicate(doctorId:string,date:string,items:Array<{doctor_id:string;planned_date:string}>){const target=dateMs(date);const match=items.find(x=>x.doctor_id===doctorId&&Math.abs(dateMs(x.planned_date)-target)/DAY<=5);return match?.planned_date||null}
export function shiftPlanItems<T extends {planned_date:string}>(items:T[],oldStart:string,newStart:string){const delta=dateMs(newStart)-dateMs(oldStart);return items.map(item=>({...item,planned_date:new Date(dateMs(item.planned_date)+delta).toISOString().slice(0,10)}))}
export function distributeSuggestionsByArea<T extends {id:string;city?:string|null;clinic_name?:string|null;classification?:string|null}>(suggestions:T[],days:string[]){
  const rank=(c?:string|null)=>({A:0,B:1,C:2}[String(c||"").toUpperCase()]??3);
  const groups=new Map<string,T[]>();
  for(const item of suggestions){
    const city=String(item.city||"بدون منطقة");
    const clinic=String(item.clinic_name||"بدون عيادة");
    const key=`${city}::${clinic}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(item);
  }
  const ordered=[...groups.values()]
    .map(g=>g.sort((a,b)=>rank(a.classification)-rank(b.classification)))
    .sort((a,b)=>rank(a[0]?.classification)-rank(b[0]?.classification)||String(a[0]?.city||"").localeCompare(String(b[0]?.city||""),"ar"));
  const out:Record<string,T[]>={};
  days.forEach(d=>out[d]=[]);
  // Place each clinic group on the least-loaded day to keep daily coverage balanced.
  ordered.forEach(group=>{
    if(!days.length)return;
    const targetDay=days.reduce((best,day)=>out[day].length<out[best].length?day:best,days[0]);
    out[targetDay].push(...group);
  });
  return out;
}