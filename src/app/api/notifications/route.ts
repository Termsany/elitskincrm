import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
export async function GET(){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const r=await query(`SELECT n.*, t.title task_title,
    CASE WHEN n.plan_id IS NOT NULL THEN 'الخطة الأسبوعية' ELSE NULL END plan_title
    FROM task_notifications n
    LEFT JOIN tasks t ON t.id=n.task_id
    WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50`, [user.id]);
  const unread=await query(`SELECT count(*)::int cnt FROM task_notifications WHERE user_id=$1 AND is_read=false`, [user.id]);
  return NextResponse.json({ notifications: r.rows, unread: unread.rows[0].cnt });
}
export async function PATCH(req: Request){
  const user = await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(body?.all){
    await query(`UPDATE task_notifications SET is_read=true,read_at=COALESCE(read_at,now()) WHERE user_id=$1`, [user.id]);
  } else if(body?.id){
    const id=String(body.id);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({error:"Invalid notification id"},{status:400});
    const updated=await query(`UPDATE task_notifications SET is_read=true,read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id`, [id, user.id]);
    if(!updated.rows.length) return NextResponse.json({error:"Not found"},{status:404});
  }
  return NextResponse.json({ok:true});
}
