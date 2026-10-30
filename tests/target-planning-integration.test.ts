import {describe,it,expect,vi,afterAll} from 'vitest';
import {pool} from '@/lib/db';
const state=vi.hoisted(()=>({user:null as null|{id:string;role:string}}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>state.user}));
import {GET as repGet,POST as repPost} from '@/app/api/forecast/targets/route';
import {GET as adminGet,POST as adminPost} from '@/app/api/admin/forecast/targets/route';
import {repView,adminView} from '@/lib/forecast';
import {GET as oldGet,POST as oldPost} from '@/app/api/admin/forecast/route';
import * as repApi from '@/app/api/admin/reps/[id]/route';
const rep='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222',clinic='44444444-4444-4444-8444-444444444444',product='33333333-3333-4333-8333-333333333333';
const post=async(fn:(req:Request)=>Promise<Response>,body:unknown)=>{const r=await fn(new Request('http://localhost',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
const as=(role:'admin'|'sales_rep')=>state.user={id:role==='admin'?admin:rep,role};
const months=Array.from({length:12},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,amount:i===0?200:i===11?0:100}));
describe.skipIf(process.env.TARGET_INTEGRATION_TEST_DB!=='1')('real disposable PostgreSQL target lifecycle',()=>{
 afterAll(async()=>pool.end());
 it('migration reset preserved historical versions/events while seeding annual amount',async()=>{
  expect((await pool.query('SELECT annual_amount FROM rep_target_years WHERE rep_id=$1 AND year=2026',[rep])).rows[0].annual_amount).toBe('1200.00');
  for(const table of ['rep_monthly_sales','forecast_sales','forecast_targets'])expect(Number((await pool.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count)).toBe(0);
  expect((await pool.query("SELECT to_regclass('forecast_versions') AS versions,to_regclass('forecast_events') AS events")).rows[0]).toEqual({versions:'forecast_versions',events:'forecast_events'});
 });
 it('rejects retired write endpoints and isolates rep/admin scope',async()=>{
  as('admin');expect((await post(oldPost,{action:'set_target',month:'2026-01',rep_id:rep,clinic_id:clinic,product_id:product,quantity:1})).status).toBe(400);
  expect((repApi as Record<string,unknown>).POST).toBeUndefined();
  expect((await repGet(new Request('http://localhost?year=2026'))).status).toBe(403);
  as('sales_rep');expect((await adminGet(new Request('http://localhost?year=2026'))).status).toBe(403);
 });
 it('keeps annual override authoritative and requires annual approval before breakdown',async()=>{
  as('admin');expect((await post(adminPost,{action:'set_month',rep_id:rep,month:'2026-01',amount:200})).status).toBe(200);
  expect((await post(adminPost,{action:'set_month',rep_id:rep,month:'2026-02',amount:1200})).status).toBe(400);
  as('sales_rep');expect((await post(repPost,{action:'allocate_year',year:2026,months:months.filter(m=>m.month!=='2026-01')})).status).toBe(200);
  const baseline=await post(repPost,{action:'submit_breakdown',month:'2026-01',lines:[{clinic_id:clinic,product_id:product,quantity:3,unit_price:0.29}]});expect(baseline.status).toBe(409);
  expect((await post(repPost,{action:'allocate_year',year:2026,months:months.filter(m=>m.month!=='2026-01')})).status).toBe(409);
  const plan=await (await repGet(new Request('http://localhost?year=2026'))).json();expect(plan.months).toHaveLength(12);expect(plan.months[0]).toMatchObject({month:'2026-01',amount:'200.00',source:'admin'});const annual=plan.versions[0];
  as('admin');expect((await post(adminPost,{action:'set_month',rep_id:rep,month:'2026-02',amount:100})).status).toBe(409);expect((await post(adminPost,{action:'set_annual',rep_id:rep,year:2026,amount:1201})).status).toBe(409);expect((await post(adminPost,{action:'approve_year',id:annual.id})).status).toBe(200);
  expect((await post(adminPost,{action:'approve_year',id:annual.id,reason:'اعتماد الخطة'})).status).toBe(409);
  expect((await pool.query('SELECT status FROM rep_target_versions WHERE id=$1',[annual.id])).rows[0].status).toBe('approved');
  await expect(pool.query('UPDATE rep_target_versions SET amount=300 WHERE id=$1',[annual.id])).rejects.toThrow(/immutable/);
 });
 it('rejects changed admin amounts after annual approval while allowing idempotent writes',async()=>{
  as('admin');
  expect((await post(adminPost,{action:'set_month',rep_id:rep,month:'2026-01',amount:201})).status).toBe(409);
  expect((await post(adminPost,{action:'set_annual',rep_id:rep,year:2026,amount:1201})).status).toBe(409);
  expect((await post(adminPost,{action:'set_month',rep_id:rep,month:'2026-01',amount:200})).status).toBe(200);
  expect((await post(adminPost,{action:'set_annual',rep_id:rep,year:2026,amount:1200})).status).toBe(200);
  as('sales_rep');const view=await (await repGet(new Request('http://localhost?year=2026'))).json();expect(Number(view.months[0].amount)).toBe(200);
 });
 it('retains the approved annual baseline after a rejected distribution revision',async()=>{
  as('sales_rep');const sent=await post(repPost,{action:'allocate_year',year:2026,reason:'مراجعة التوزيع',months:months.filter(m=>m.month!=='2026-01')});expect(sent.status).toBe(200);
  as('admin');expect((await post(adminPost,{action:'reject_year',id:sent.body.id,reason:'التوزيع السابق صحيح'})).status).toBe(200);
  as('sales_rep');const view=await (await repGet(new Request('http://localhost?year=2026'))).json();
  expect(view.year_plan.status).toBe('rejected');expect(view.approved_year_plan.status).toBe('approved');expect(view.approved_year_plan.lines).toHaveLength(12);
  expect(Number(view.months[0].amount)).toBe(200);
 });
 it('snapshots monthly clinic-product price, delta and counts only approved detail',async()=>{
  as('sales_rep');const line={clinic_id:clinic,product_id:product,quantity:3,unit_price:0.29};
  expect((await post(repPost,{action:'submit_breakdown',month:'2026-01',lines:[{...line,unit_price:0.3}]})).status).toBe(409);
  const sent=await post(repPost,{action:'submit_breakdown',month:'2026-01',lines:[{clinic_id:clinic,product_id:product,quantity:3}]});expect(sent).toMatchObject({status:200,body:{status:'pending',total:0.87,delta:-199.13}});
  expect((await repView(rep,'2026-01')).summary.target_value).toBe(0);
  as('admin');expect((await post(adminPost,{action:'approve_breakdown',id:sent.body.id,reason:'اعتماد التفصيل'})).status).toBe(200);
  const read=await repView(rep,'2026-01');expect(read.targets).toMatchObject([{quantity:3,unit_price:'0.29'}]);expect(read.summary.target_value).toBeCloseTo(0.87);
  expect((await adminView('2026-01')).targets).toHaveLength(1);
  expect((await pool.query('SELECT unit_price FROM rep_target_lines WHERE version_id=$1',[sent.body.id])).rows[0].unit_price).toBe('0.29');
  await expect(pool.query('DELETE FROM rep_target_lines WHERE version_id=$1',[sent.body.id])).rejects.toThrow(/immutable/);
  const view=await (await adminGet(new Request('http://localhost?year=2026&rep_id='+rep))).json();expect(view.versions.some((x:{status:string})=>x.status==='approved')).toBe(true);const queue=await (await adminGet(new Request('http://localhost?year=2026'))).json();expect(queue.team).toEqual(expect.arrayContaining([expect.objectContaining({rep_id:rep})]));expect(queue.pending_breakdowns).toEqual([]);
 });
 it('displays approved priced lines despite a rejected newer revision',async()=>{
  as('sales_rep');const sent=await post(repPost,{action:'submit_breakdown',month:'2026-01',reason:'quantity changed',lines:[{clinic_id:clinic,product_id:product,quantity:5}]});expect(sent.status).toBe(200);
  as('admin');expect((await post(adminPost,{action:'reject_breakdown',id:sent.body.id,reason:'راجع الكمية'})).status).toBe(200);
  as('sales_rep');const view=await (await repGet(new Request('http://localhost?year=2026'))).json();const row=view.breakdowns.find((x:{month:string})=>x.month==='2026-01');
  expect(row).toMatchObject({status:'rejected',reason:'راجع الكمية',approved_lines:[{clinic_id:clinic,product_id:product,quantity:3,unit_price:'0.29'}]});
  expect(row.lines).toMatchObject([{clinic_id:clinic,product_id:product,quantity:5}]);
 });
 it('requires reason for approved revisions and protects monthly decisions',async()=>{
  const changed=months.filter(m=>m.month!=='2026-01').map(m=>({...m,amount:m.month==='2026-02'?110:m.month==='2026-03'?90:m.amount}));
  as('sales_rep');expect((await post(repPost,{action:'allocate_year',year:2026,months:changed})).status).toBe(400);
  const revisedYear=await post(repPost,{action:'allocate_year',year:2026,reason:'reallocate',months:changed});expect(revisedYear.status).toBe(200);
  as('admin');expect((await post(adminPost,{action:'reject_year',id:revisedYear.body.id,reason:'not needed'})).status).toBe(200);
  as('sales_rep');expect((await post(repPost,{action:'submit_breakdown',month:'2026-01',lines:[{clinic_id:clinic,product_id:product,quantity:4}]})).status).toBe(400);
  const revised=await post(repPost,{action:'submit_breakdown',month:'2026-01',reason:'updated demand',lines:[{clinic_id:clinic,product_id:product,quantity:4}]});expect(revised.status).toBe(200);
  const before=await (await repGet(new Request('http://localhost?year=2026'))).json();expect(before.breakdowns.find((x:{month:string})=>x.month==='2026-01').approved_lines[0].quantity).toBe(3);
  as('admin');expect((await post(adminPost,{action:'reject_breakdown',id:revised.body.id,reason:'keep baseline'})).status).toBe(200);
 });
 it('rechecks a newly pending breakdown at annual approval',async()=>{
  as('sales_rep');const changed=months.filter(m=>m.month!=='2026-01').map(m=>({...m,amount:m.month==='2026-02'?110:m.month==='2026-03'?90:m.amount}));
  const sent=await post(repPost,{action:'allocate_year',year:2026,reason:'new monthly budget',months:changed});expect(sent.status).toBe(200);
  as('admin');const collision=await pool.query("INSERT INTO rep_target_versions(rep_id,year,month,level,version,status,amount) VALUES($1,2026,'2026-02-01','monthly',1,'pending',100) RETURNING id",[rep]);
  expect((await post(adminPost,{action:'approve_year',id:sent.body.id,reason:'reviewed'})).status).toBe(409);
  expect((await pool.query('SELECT status FROM rep_target_versions WHERE id=$1',[sent.body.id])).rows[0].status).toBe('pending');
  expect((await post(adminPost,{action:'reject_year',id:sent.body.id,reason:'conflict'})).status).toBe(200);
  await pool.query("UPDATE rep_target_versions SET status='rejected' WHERE id=$1",[collision.rows[0].id]);
 });
 it('exposes target blockers and prevents close while annual or monthly decisions are pending',async()=>{
  as('admin');const m='2025-11';await pool.query('INSERT INTO forecast_months(month) VALUES($1) ON CONFLICT DO NOTHING',[m+'-01']);
  await pool.query('INSERT INTO rep_target_years(rep_id,year,annual_amount,set_by) VALUES($1,2025,100,$2)',[rep,admin]);
  const annual=await pool.query("INSERT INTO rep_target_versions(rep_id,year,level,version,status,amount) VALUES($1,2025,'annual',1,'pending',100) RETURNING id",[rep]);
  let view=await (await oldGet(new Request('http://localhost?month='+m))).json();expect(view.close_blockers.pending_year_allocations).toBe(1);
  expect((await post(oldPost,{action:'close',month:m})).status).toBe(409);
  await pool.query("UPDATE rep_target_versions SET status='rejected' WHERE id=$1",[annual.rows[0].id]);
  const monthly=await pool.query("INSERT INTO rep_target_versions(rep_id,year,month,level,version,status,amount) VALUES($1,2025,$2,'monthly',1,'pending',100) RETURNING id",[rep,m+'-01']);
  view=await (await oldGet(new Request('http://localhost?month='+m))).json();expect(view.close_blockers.pending_breakdowns).toBe(1);
  expect((await post(oldPost,{action:'close',month:m})).status).toBe(409);
  await pool.query("UPDATE rep_target_versions SET status='rejected' WHERE id=$1",[monthly.rows[0].id]);
 });
 it('allows a new annual goal after an unrelated forecast month closed',async()=>{
  const fresh='66666666-6666-4666-8666-666666666666';
  await pool.query("INSERT INTO users(id,name,email,password_hash,role,assigned_product_id) VALUES($1,'Late rep','late-rep@test.invalid','x','sales_rep',$2)",[fresh,product]);
  await pool.query("INSERT INTO forecast_months(month,closed_at) VALUES('2026-03-01',now()) ON CONFLICT(month) DO UPDATE SET closed_at=now()");
  as('admin');expect((await post(adminPost,{action:'set_annual',rep_id:fresh,year:2026,amount:900})).status).toBe(200);
  expect((await pool.query('SELECT annual_amount FROM rep_target_years WHERE rep_id=$1 AND year=2026',[fresh])).rows[0].annual_amount).toBe('900.00');
 });
 it('locks closed months and rejects malformed inputs',async()=>{
  as('admin');expect((await post(adminPost,{action:'set_annual',rep_id:rep,year:'26',amount:100})).status).toBe(400);
  expect((await post(adminPost,{action:'set_annual',rep_id:rep,year:'2026',amount:1.001})).status).toBe(400);
  await pool.query("UPDATE forecast_months SET closed_at=now() WHERE month='2026-01-01'");
  as('sales_rep');expect((await post(repPost,{action:'submit_breakdown',month:'2026-01',lines:[{clinic_id:clinic,product_id:product,quantity:1,unit_price:0.29}]})).status).toBe(409);
 });
});
