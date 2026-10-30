import { describe,it,expect,vi,beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ user: null as null | {id:string;role:string}, calls: [] as string[] }));
vi.mock('@/lib/session', () => ({getCurrentUser: async () => state.user}));
vi.mock('@/lib/db', () => ({pool:{connect: async () => {throw Error('unexpected database access')}},query: async (sql:string) => { state.calls.push(sql); return {rows:[]}; }}));
import {GET as repGet,POST as repPost} from '@/app/api/forecast/route';
import {GET as adminGet,POST as adminPost} from '@/app/api/admin/forecast/route';
import {POST as salePost,GET as saleGet} from '@/app/api/forecast/sales/route';
import {GET as clinicGet,POST as clinicPost} from '@/app/api/admin/forecast/clinics/route';
describe('forecast route authorization',()=> {
 beforeEach(()=>{state.user=null;state.calls=[]});
 it('denies anonymous requests before database access',async()=>{
  for(const result of [await repGet(new Request('http://localhost/api/forecast?month=2026-10')),await adminGet(new Request('http://localhost/api/admin/forecast?month=2026-10')),await repPost(new Request('http://localhost/api/forecast',{method:'POST',body:'{}'})),await adminPost(new Request('http://localhost/api/admin/forecast',{method:'POST',body:'{}'})),await salePost(new Request('http://localhost/api/forecast/sales',{method:'POST',body:'{}'})),await saleGet(new Request('http://localhost/api/forecast/sales?month=2026-10')),await clinicPost(new Request('http://localhost/api/admin/forecast/clinics',{method:'POST',body:'{}'}))]) expect(result.status).toBe(403);
  expect(state.calls).toEqual([]);
 });
 it('denies rep admin actions and admin rep mutation',async()=>{
  state.user={id:'11111111-1111-4111-8111-111111111111',role:'sales_rep'};
  expect((await adminPost(new Request('http://localhost/api/admin/forecast',{method:'POST',body:'{}'}))).status).toBe(403);
  expect((await clinicPost(new Request('http://localhost/api/admin/forecast/clinics',{method:'POST',body:'{}'}))).status).toBe(403);
  state.user={id:'11111111-1111-4111-8111-111111111111',role:'admin'};
  expect((await repPost(new Request('http://localhost/api/forecast',{method:'POST',body:'{}'}))).status).toBe(403);
 });
 it('does not leak database failure details to authenticated callers',async()=>{state.user={id:'11111111-1111-4111-8111-111111111111',role:'sales_rep'};const result=await repPost(new Request('http://localhost/api/forecast',{method:'POST',body:JSON.stringify({action:'save',month:'2026-10',lines:[]})}));expect(result.status).toBe(500);expect(JSON.stringify(await result.json())).not.toContain('unexpected database access');});
});


describe('clinic directory scope',()=>{
 it('denies reps directory access and has no fixed doctor cap',async()=>{
  state.user={id:'11111111-1111-4111-8111-111111111111',role:'sales_rep'};
  expect((await clinicGet()).status).toBe(403);
  state.user={id:'11111111-1111-4111-8111-111111111111',role:'admin'};
  state.calls=[];expect((await clinicGet()).status).toBe(200);
  expect(state.calls.find(s=>s.includes('FROM doctors'))).toBeDefined();
  expect(state.calls.find(s=>s.includes('FROM doctors'))).not.toMatch(/LIMIT 1000/i);
 });
});
