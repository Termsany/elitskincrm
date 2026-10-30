import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetPlanningClient, targetRequest, fetchTargetPlan, allocationBalance, breakdownValue } from '@/app/forecast/TargetPlanningClient';

const rep = {year:2026,annual_target:1200,months:[{month:'2026-10',amount:200,source:'admin',status:'approved'}],year_plan:null,breakdowns:[],prices:[{clinic_id:'c1',product_id:'p1',price:20}]};
const directory = {clinics:[{id:'c1',name:'عيادة الندى'}],products:[{id:'p1',name:'منتج أ'}],prices:[{clinic_id:'c1',product_id:'p1',price:20}]};
const admin = {year:2026,annual_targets:[{rep_id:'r1',rep_name:'سارة',amount:1200}],monthly_targets:[{rep_id:'r1',rep_name:'سارة',month:'2026-10',amount:200}],pending_year_allocations:[{id:'a1',rep_id:'r1',rep_name:'سارة',year:2026,months:[{month:'2026-11',amount:500}]}],pending_breakdowns:[{id:'b1',rep_id:'r1',rep_name:'سارة',month:'2026-10',lines:[{clinic_id:'c1',product_id:'p1',quantity:10,unit_price:20}]}],team:[{rep_id:'r1',rep_name:'سارة'}]};
const render = (role:'admin'|'sales_rep', plan:unknown, overrides:Record<string,unknown>={}) => renderToStaticMarkup(createElement(TargetPlanningClient,{role,month:'2026-10',data:plan,directory,busy:false,onAction:()=>{},...overrides} as never));
afterEach(()=>vi.unstubAllGlobals());
describe('target planning contract',()=>{
 it('mounts planning beside existing forecast views using the same selected month and refresh cycle',()=>{
  const source=readFileSync('src/app/forecast/ForecastClient.tsx','utf8');
  expect(source).toContain('fetchTargetPlan(month,role)');
  expect(source).toContain('<TargetPlanningClient role={role} month={month}');
  expect(source).not.toContain('action("set_target"');
  expect(readFileSync('src/app/forecast/TargetPlanningClient.tsx','utf8')).not.toContain('delta!==0'); // Display the difference; do not require exact unit-price equality.
 });
 it('routes yearly and monthly actions to scoped target endpoints with exact payloads',()=>{
  expect(targetRequest('sales_rep','allocate_year',{year:2026,months:[{month:'2026-11',amount:500}]},'2026-10')).toEqual({url:'/api/forecast/targets?year=2026',body:{action:'allocate_year',year:2026,months:[{month:'2026-11',amount:500}]}});
  expect(targetRequest('sales_rep','submit_breakdown',{lines:[{clinic_id:'c1',product_id:'p1',quantity:10}]},'2026-10')).toEqual({url:'/api/forecast/targets?year=2026',body:{action:'submit_breakdown',month:'2026-10',lines:[{clinic_id:'c1',product_id:'p1',quantity:10}]}});
  expect(targetRequest('admin','set_annual',{rep_id:'r1',year:2026,amount:1200},'2026-10').body).toEqual({action:'set_annual',rep_id:'r1',year:2026,amount:1200});
  expect(targetRequest('admin','approve_breakdown',{id:'b1'},'2026-10').body).toEqual({action:'approve_breakdown',id:'b1'});
 });
 it('loads the selected year for each authorized role without replacing the forecast month',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>rep})));
  await fetchTargetPlan('2026-10','sales_rep');
  expect(fetch).toHaveBeenCalledWith('/api/forecast/targets?year=2026',expect.objectContaining({cache:'no-store'}));
 });
 it('deducts admin overrides before allocating the annual remainder and values units by price',()=>{
  expect(allocationBalance(rep,{'2026-11':'500','2026-12':'500'})).toBe(0);
  expect(breakdownValue([{clinic_id:'c1',product_id:'p1',quantity:10}],directory.prices)).toBe(200);
 });
 it('renders rep allocation and priced month breakdown with pending status and delta in SAR',()=>{
  const html=render('sales_rep',{...rep,year_plan:{status:'pending',lines:[]},breakdowns:[{month:'2026-10',status:'approved',lines:[{clinic_id:'c1',product_id:'p1',quantity:10}]}]});
  for(const text of ['توزيع الهدف السنوي','المتبقي للتوزيع','إرسال التوزيع للمراجعة','تفصيل هدف الشهر','كمية منتج أ في عيادة الندى','الفرق عن هدف الشهر','ر.س','بانتظار المراجعة','معتمد'])expect(html).toContain(text);
  expect(html).not.toContain('set_target');
 });
 it('shows approved baseline separately from rejected proposal and explains locked admin amounts',()=>{
  const html=render('sales_rep',{...rep,breakdowns:[{month:'2026-10',status:'rejected',reason:'راجع الكمية',lines:[{clinic_id:'c1',product_id:'p1',quantity:5}],approved_lines:[{clinic_id:'c1',product_id:'p1',quantity:10,unit_price:20}]}]});
  expect(html).toContain('التفصيل المعتمد');expect(html).toContain('10');expect(html).toContain('راجع الكمية');
  expect(render('admin',admin)).toContain('لا يمكن تغيير الأهداف بعد إرسال التوزيع للمراجعة');
 });
 it('shows approved annual allocation beside rejected revision status',()=>{
  const html=render('sales_rep',{...rep,year_plan:{status:'rejected',lines:[]},approved_year_plan:{status:'approved',lines:[{month:'2026-10',amount:200}]}});
  expect(html).toContain('التوزيع المعتمد');expect(html).toContain('مرفوض');expect(html).toContain('معتمد');
 });
 it('renders revision reason fields and preserves the approved baseline beside pending proposals',()=>{
  const html=render('sales_rep',{...rep,year_plan:{status:'pending',request_reason:'نقل الميزانية',lines:[]},approved_year_plan:{status:'approved',lines:[{month:'2026-10',amount:200}]},breakdowns:[{month:'2026-10',status:'pending',request_reason:'تغيير الكمية',lines:[{clinic_id:'c1',product_id:'p1',quantity:5}],approved_lines:[{clinic_id:'c1',product_id:'p1',quantity:10,unit_price:20}]}]});
  for(const text of ['سبب تعديل التوزيع السنوي','سبب تعديل تفصيل الشهر','نقل الميزانية','تغيير الكمية','التوزيع المعتمد','التفصيل المعتمد'])expect(html).toContain(text);
  const source=readFileSync('src/app/forecast/TargetPlanningClient.tsx','utf8');
  expect(source).toContain('reason:annualReason.trim()');expect(source).toContain('reason:monthlyReason.trim()');
 });
 it('renders admin SAR controls and both approval queues without legacy clinic target action',()=>{
  const html=render('admin',admin);
  for(const text of ['هدف سنوي للمندوب','هدف شهر للمندوب','حفظ الهدف السنوي','حفظ هدف الشهر','مراجعة التوزيع السنوي','مراجعة تفصيل الشهر','اعتماد التوزيع','اعتماد التفصيل','رفض'])expect(html).toContain(text);
  expect(html).not.toContain('عيادة الهدف');
  expect(render('admin',{...admin,pending_year_allocations:[{...admin.pending_year_allocations[0],reason:'طلب تعديل سنوي'}],pending_breakdowns:[{...admin.pending_breakdowns[0],reason:'طلب تعديل شهري'}]})).toContain('طلب تعديل سنوي');
  expect(render('admin',{...admin,pending_year_allocations:[],pending_breakdowns:[{...admin.pending_breakdowns[0],reason:'طلب تعديل شهري'}]})).toContain('طلب تعديل شهري');
 });
});
