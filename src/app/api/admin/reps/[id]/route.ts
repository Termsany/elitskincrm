import {NextResponse} from "next/server";
import {pool,query} from "@/lib/db";
import {getCurrentUser} from "@/lib/session";
import {monthlySaleSchema} from "@/lib/validation";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const a=await getCurrentUser();if(!a||a.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});const {id}=await params;const rep=await query(`SELECT u.id,u.name,u.email,u.job_title,u.university,u.hire_date,u.iqama_expiry,u.salary,u.annual_sales_target,u.active,COALESCE((SELECT sum(amount) FROM rep_monthly_sales s WHERE s.rep_id=u.id AND extract(year from s.sale_month)=extract(year from current_date)),0)::numeric annual_sales,COALESCE((SELECT json_agg(rp.product_id) FROM rep_products rp WHERE rp.rep_id=u.id),'[]') products FROM users u WHERE u.id=$1 AND u.role='sales_rep'`,[id]);if(!rep.rows[0])return NextResponse.json({error:"المندوب غير موجود"},{status:404});const sales=await query(`SELECT id,sale_month,amount FROM rep_monthly_sales WHERE rep_id=$1 ORDER BY sale_month DESC`,[id]);return NextResponse.json({rep:rep.rows[0],sales:sales.rows})}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){const a=await getCurrentUser();if(!a||a.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});const {id}=await params;const d=await req.json().catch(()=>null);if(!d)return NextResponse.json({error:"بيانات غير صحيحة"},{status:400});const c=await pool.connect();try{await c.query("BEGIN");await c.query(`UPDATE users SET name=$1,university=$2,hire_date=$3,iqama_expiry=$4,salary=$5,annual_sales_target=$6 WHERE id=$7 AND role='sales_rep'`,[d.name,d.university||"",d.hire_date||null,d.iqama_expiry||null,Number(d.salary)||0,Number(d.annual_sales_target)||0,id]);await c.query("DELETE FROM rep_products WHERE rep_id=$1",[id]);for(const pid of Array.isArray(d.product_ids)?d.product_ids:[])await c.query("INSERT INTO rep_products(rep_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,pid]);await c.query("COMMIT");return NextResponse.json({ok:true})}catch{await c.query("ROLLBACK");return NextResponse.json({error:"تعذر حفظ بيانات المندوب"},{status:400})}finally{c.release()}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const admin=await getCurrentUser();
 if(!admin||admin.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params;
 const body=await req.json().catch(()=>null);
 const parsed=monthlySaleSchema.safeParse(body);
 if(!parsed.success)return NextResponse.json({error:"الشهر وقيمة المبيعات غير صالحة"},{status:400});
 const {sale_month,amount}=parsed.data;
 await query(`INSERT INTO rep_monthly_sales(rep_id,sale_month,amount,created_by) VALUES($1,$2::date,$3,$4) ON CONFLICT(rep_id,sale_month) DO UPDATE SET amount=EXCLUDED.amount`,[id,`${sale_month}-01`,amount,admin.id]);
 return NextResponse.json({ok:true});
}
