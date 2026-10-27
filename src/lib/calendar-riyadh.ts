// Calendar dates and wall-clock times are always interpreted in Asia/Riyadh (UTC+03).
const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function fields(value:Date){return Object.fromEntries(parts.formatToParts(value).filter(p=>p.type!=="literal").map(p=>[p.type,p.value])) as Record<string,string>}
export function riyadhDate(value:Date){const x=fields(value);return `${x.year}-${x.month}-${x.day}`}
export function riyadhTime(value:Date){const x=fields(value);return `${x.hour}:${x.minute}`}
export function riyadhDateTime(date:string,time:string){return new Date(`${date}T${time}:00+03:00`).toISOString()}
function utcDay(date:string){return new Date(`${date}T12:00:00Z`)}
function addDays(date:string,amount:number){const d=utcDay(date);d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10)}
export function calendarRange(date:string,view:"day"|"week"|"month"){
 const anchor=utcDay(date);
 let from=date,to=addDays(date,1);
 if(view==="week"){from=addDays(date,-anchor.getUTCDay());to=addDays(from,7)}
 if(view==="month"){from=monthCalendarDays(date)[0];to=addDays(from,42)}
 return {from:riyadhDateTime(from,"00:00"),to:riyadhDateTime(to,"00:00")};
}
export function monthCalendarDays(date:string){const first=`${date.slice(0,7)}-01`;const start=addDays(first,-utcDay(first).getUTCDay());return Array.from({length:42},(_,i)=>addDays(start,i))}
export function weekCalendarDays(date:string){const start=addDays(date,-utcDay(date).getUTCDay());return Array.from({length:7},(_,i)=>addDays(start,i))}
export function shiftCalendarEvent(start:string,end:string,target:string){const first=new Date(start),last=new Date(end),newStart=new Date(riyadhDateTime(target,riyadhTime(first)));return{starts_at:newStart.toISOString(),ends_at:new Date(newStart.getTime()+last.getTime()-first.getTime()).toISOString()}}

export function eventOverlapsRiyadhDay(start:string,end:string,date:string){const range=calendarRange(date,"day");return new Date(start).getTime()<new Date(range.to).getTime()&&new Date(end).getTime()>new Date(range.from).getTime()}
