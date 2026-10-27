import {NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/session";
import {query} from "@/lib/db";
import {riyadhDateParts} from "@/lib/plan-reminders";
import {summarizeDay} from "@/lib/daily-workspace";
import {dailyVisitsSql,dailyPlansSql,dailyTasksSql,dailyRequestsSql} from "@/lib/daily-workspace-queries";
export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(user.role!=="sales_rep")return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  const today=riyadhDateParts().date;
  const [visits,plans,tasks,requests]=await Promise.all([query(dailyVisitsSql,[user.id,today]),query(dailyPlansSql,[user.id,today]),query(dailyTasksSql,[user.id,today]),query(dailyRequestsSql,[user.id])]);
  const items=plans.rows.map(row=>({...row,id:String(row.id),done:Boolean(row.done)}));
  return NextResponse.json({today,updatedAt:new Date().toISOString(),summary:summarizeDay(items),visits:visits.rows[0].total,items,tasks:tasks.rows,taskCount:tasks.rows[0]?.total_count??0,overdue:tasks.rows[0]?.overdue_count??0,activeRequests:requests.rows[0].total},{headers:{"Cache-Control":"private, no-store"}});
 }catch{console.error("Daily workspace query failed");return NextResponse.json({error:"تعذر تحميل يومك؛ حاول مرة أخرى"},{status:500});}
}
