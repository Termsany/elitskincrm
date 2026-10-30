import {it,expect,vi} from 'vitest';
import {pool} from '@/lib/db';
import {saveForecast} from '@/lib/forecast';
import {riyadhNow} from '@/lib/forecast-contract';

it('locks representative before forecast month and rejects a closed month',async()=>{
 const queries:string[]=[];
 const client={query:vi.fn(async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('SELECT closed_at FROM forecast_months'))return {rows:[{closed_at:new Date()}],rowCount:1};
  return {rows:[],rowCount:0};
 }),release:vi.fn()};
 const connect=vi.spyOn(pool,'connect').mockResolvedValue(client as never);
 try {
  await expect(saveForecast('11111111-1111-4111-8111-111111111111',{month:riyadhNow().month,action:'save',lines:[{clinic_id:'22222222-2222-4222-8222-222222222222',product_id:'33333333-3333-4333-8333-333333333333',quantity:1}]})).rejects.toMatchObject({message:'Month closed',status:409});
  const rep=queries.findIndex(q=>q.includes('FROM users WHERE id=$1 FOR UPDATE'));
  const month=queries.findIndex(q=>q.includes('INSERT INTO forecast_months'));
  expect(rep).toBeGreaterThan(0);
  expect(rep).toBeLessThan(month);
  expect(queries).toContain('ROLLBACK');
 } finally {connect.mockRestore()}
});
