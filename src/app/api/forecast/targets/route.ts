import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {forecastHttpError,fail} from '@/lib/forecast';
import {yearKey,targetView,submitDistribution,submitBreakdown} from '@/lib/target-planning';
export async function GET(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{return NextResponse.json(await targetView(u.id,yearKey(new URL(req.url).searchParams.get('year'))))}catch(e){return forecastHttpError(e)}}
export async function POST(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{const b=await req.json().catch(()=>fail('Invalid JSON'));if(b.action==='submit_distribution'||b.action==='allocate_year')return NextResponse.json(await submitDistribution(u.id,b));if(b.action==='submit_breakdown')return NextResponse.json(await submitBreakdown(u.id,b));return fail('Invalid action')}catch(e){return forecastHttpError(e)}}
