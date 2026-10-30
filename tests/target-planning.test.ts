import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {money,yearKey,targetMonth,allocateAmounts,breakdownLines} from '@/lib/target-planning';

describe('target planning contract',()=>{
 it('locks legacy tables before migration count guard in the runner transaction',()=>{
  const sql=readFileSync('migrations/039_rep_target_redesign.sql','utf8');
  expect(sql.indexOf('LOCK TABLE rep_monthly_sales, forecast_sales, forecast_targets IN ACCESS EXCLUSIVE MODE')).toBeGreaterThanOrEqual(0);
  expect(sql.indexOf('LOCK TABLE rep_monthly_sales, forecast_sales, forecast_targets IN ACCESS EXCLUSIVE MODE')).toBeLessThan(sql.indexOf('SELECT count(*) FROM rep_monthly_sales'));
 });
 it('takes the representative lock before reviewing the version row',()=>{
  const source=readFileSync('src/lib/target-planning.ts','utf8');
  const review=source.slice(source.indexOf('export const reviewTarget='),source.indexOf('export const approvedTargetBreakdown='));
  expect(review.indexOf('await repExists(c,probe.rows[0].rep_id)')).toBeGreaterThan(review.indexOf('SELECT rep_id FROM rep_target_versions'));
  expect(review.indexOf('await repExists(c,probe.rows[0].rep_id)')).toBeLessThan(review.indexOf('FOR UPDATE'));
 });
 it('accepts exact monetary cents including zero, rejects imprecise or invalid values',()=>{
  expect(money(0)).toBe(0);expect(money(0.29)).toBe(29);expect(money(12.34)).toBe(1234);
  for(const x of [-1,1.001,'1.00',NaN,Infinity]) expect(()=>money(x)).toThrow();
 });
 it('validates years and calendar months without silently normalizing malformed tokens',()=>{
  expect(yearKey('2026')).toBe(2026);expect(targetMonth('2026-12')).toBe('2026-12');
  for(const x of ['2026-00','2026-13','2026-1','2026-12-01'])expect(()=>targetMonth(x)).toThrow();
  expect(()=>yearKey('26')).toThrow();
 });
 it('allocates only the unassigned annual remainder and rejects override changes',()=>{
  const overrides=[{month:'2026-01',amount:200}];
  const months=Array.from({length:12},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,amount:i===0?200:100}));
  expect(()=>allocateAmounts(1200,months,overrides)).toThrow();
  expect(allocateAmounts(1200,months.map(x=>({...x,amount:x.month==='2026-12'?0:x.amount})),overrides)).toHaveLength(12);
  expect(()=>allocateAmounts(1200,months.map(x=>({...x,amount:x.month==='2026-01'?100:x.amount})),overrides)).toThrow();
 });
 it('snapshots integer quantities and prices with monetary delta',()=>{
  const lines=breakdownLines([{clinic_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',quantity:3,unit_price:0.29}],1);
  expect(lines).toMatchObject({total:0.87,delta:-0.13});
  expect(()=>breakdownLines([{clinic_id:'a',product_id:'b',quantity:1.5,unit_price:1}],1)).toThrow();
 });
});
const state=vi.hoisted(()=>({user:null as null|{id:string;role:string}}));
vi.mock('@/lib/session',()=>({getCurrentUser:async()=>state.user}));
import {GET as repGet,POST as repPost} from '@/app/api/forecast/targets/route';
import {GET as adminGet,POST as adminPost} from '@/app/api/admin/forecast/targets/route';
it('denies both target API surfaces before any database activity',async()=>{
 state.user=null;
 for(const fn of [repGet,adminGet])expect((await fn!(new Request('http://localhost?year=2026'))).status).toBe(403);
 for(const fn of [repPost,adminPost])expect((await fn!(new Request('http://localhost',{method:'POST',body:'{}'}))).status).toBe(403);
 state.user={id:'11111111-1111-4111-8111-111111111111',role:'sales_rep'};
 expect((await adminPost(new Request('http://localhost',{method:'POST',body:'{}'}))).status).toBe(403);
 state.user={id:'11111111-1111-4111-8111-111111111111',role:'admin'};
 expect((await repPost(new Request('http://localhost',{method:'POST',body:'{}'}))).status).toBe(403);
});
