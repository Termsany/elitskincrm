export function summarizeDay(items: Array<{id:string;done:boolean}>) {
 const completed=items.filter(item=>item.done).length;
 return {planned:items.length,completed,remaining:items.length-completed,nextId:items.find(item=>!item.done)?.id??null,adherence:items.length?Math.round(completed/items.length*100):null};
}
