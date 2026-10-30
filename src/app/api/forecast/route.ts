import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {ForecastError,forecastHttpError,repView,saveForecast} from '@/lib/forecast';
import {monthKey,riyadhNow} from '@/lib/forecast-contract';
const error=forecastHttpError;
export async function GET(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{return NextResponse.json(await repView(u.id,monthKey(new URL(req.url).searchParams.get('month')||riyadhNow().month)))}catch(e){return error(e)}}
export async function POST(req:Request){const u=await getCurrentUser();if(!u||u.role!=='sales_rep')return NextResponse.json({error:'Forbidden'},{status:403});try{const b=await req.json().catch(()=>{throw new ForecastError('Invalid JSON')});if(!['save','submit','request_change'].includes(b?.action))throw new ForecastError('Invalid action');return NextResponse.json(await saveForecast(u.id,b))}catch(e){return error(e)}}
