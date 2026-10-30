import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {query} from '@/lib/db';
import {monthKey,riyadhNow} from '@/lib/forecast-contract';
import {forecastHttpError,fail,queueSale} from '@/lib/forecast';
export async function POST(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{return NextResponse.json(await queueSale(u.id,await req.json().catch(()=>fail('Invalid JSON'))),{status:201})}catch(e){return forecastHttpError(e)}}

export async function GET(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{const month=monthKey(new URL(req.url).searchParams.get('month')||riyadhNow().month);const r=await query("SELECT id,clinic_id,product_id,quantity,unit_price,month::text AS month FROM forecast_sales WHERE rep_id=$1 AND month=$2::date AND status='approved' AND kind='sale' ORDER BY submitted_at DESC LIMIT 1000",[u.id,`${month}-01`]);return NextResponse.json({sales:r.rows})}catch(e){return forecastHttpError(e)}}
