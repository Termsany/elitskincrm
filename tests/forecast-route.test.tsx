import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AdminForecastView, ForecastView, fetchForecast, actionRequest, canCloseMonth, buildReportRows } from '@/app/forecast/ForecastClient';

const admin = {month:'2026-10',pending:[{id:'f1',rep_id:'r1',rep_name:'سارة',month:'2026-10',status:'pending',lines:[{clinic_id:'c1',product_id:'p1',qty:5}]}],team:[{rep_id:'r1',rep_name:'سارة',target_qty:10,sold_qty:4}],alerts:[{id:'a1',message:'مراجعة خلال ٤٨ ساعة'}],sales:[{id:'s1',rep_name:'سارة',clinic_id:'c1',product_id:'p1',qty:3,status:'pending'}],clinics:[{id:'c1',name:'عيادة الندى'}],products:[{id:'p1',name:'منتج أ'}],doctors:[{id:'d1',name:'د. ليلى',clinic_name:'عيادة النص القديمة'}],prices:[],targets:[]};
const render=()=>renderToStaticMarkup(createElement(AdminForecastView,{data:admin,loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
describe('admin forecast workspace',()=>{
 it('exposes review, explicit clinic linking, prices, targets, sales, alerts and guarded close',()=>{
  const html=render();
  for(const label of ['مراجعة التوقعات','تعديل ثم اعتماد','رفض مع السبب','استثناء التأخير','سعر العيادة والمنتج','إنشاء عيادة','تصحيح ربط الطبيب','اعتماد المبيعات','ترتيب المناديب','مراجعة خلال ٤٨ ساعة','إغلاق الشهر'])expect(html).toContain(label);
  expect(html).toContain('disabled=""');
  const historical=renderToStaticMarkup(createElement(AdminForecastView,{data:{...admin,targets:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',qty:10}]},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(historical).not.toContain('الأهداف المحفوظة');
 });
 it('shows a separate sale rejection reason and source details when there is no forecast review',()=>{const html=renderToStaticMarkup(createElement(AdminForecastView,{data:{...admin,pending:[],sales:[{...admin.sales[0],kind:'return',source_sale_id:'s0',reason:'damaged',unit_price:'12.00'}]},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));expect(html).toContain('سبب رفض البيع');expect(html).toContain('مرتجع');expect(html).toContain('s0');expect(html).toContain('damaged');});
 it('offers a late exception for a rep without any submitted forecast',()=>{
  const html=renderToStaticMarkup(createElement(AdminForecastView,{data:{...admin,pending:[]},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(html).toContain('استثناء تأخر الإرسال');
  expect(html).toContain('سارة');
 });
 it('joins actual admin queue, clinic links and product directory without rep-only API',async()=>{
  const responses:Record<string,unknown>={
   '/api/admin/forecast?month=2026-10':{month:'2026-10',prices:[{clinic_id:'c1',product_id:'p1',price:13,effective_month:'2026-10'}],targets:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',quantity:10}],is_closed:false,pending:[{...admin.pending[0],reminder_due:true,lines:[{clinic_id:'c1',product_id:'p1',quantity:5}]}],pending_sales:[{...admin.sales[0],quantity:3}],team:[{rep_id:'r1',rep_name:'سارة',target:10,actual:4}],summary:{pending_reviews:1,pending_sales:1},close_blockers:{pending_forecasts:0,pending_sales:0,pending_breakdowns:1,pending_year_allocations:0}},
   '/api/admin/forecast/clinics':{clinics:admin.clinics,doctors:admin.doctors},
   '/api/admin/products':{products:admin.products}
  };
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>({ok:true,json:async()=>responses[url]})));
  const result=await fetchForecast('2026-10','admin');
  expect(result.pending[0].lines[0].qty).toBe(5);
  expect(result.sales[0].qty).toBe(3);
  expect(result.team[0].target_qty).toBe(10);
  expect(result.clinics[0].id).toBe('c1');
  expect(result.price_scope_supported).toBe(true);
  expect(result.close_blockers).toEqual(['تفصيل هدف شهر معلّق: 1']);
  expect(result.targets[0].qty).toBe(10);
  expect(result.alerts[0].message).toContain('تجاوزت ٤٨ ساعة');
  expect(fetch).toHaveBeenCalledWith('/api/admin/forecast/clinics',expect.any(Object));
 });
 it('maps manager edit-and-approve, official target and clinic link to actual backend fields',()=>{
  expect(actionRequest('admin','approve',{forecast_id:'f1',lines:[{clinic_id:'c1',product_id:'p1',qty:7}]},'2026-10')).toEqual({url:'/api/admin/forecast',body:{action:'edit_and_approve',month:'2026-10',id:'f1',lines:[{clinic_id:'c1',product_id:'p1',quantity:7}]}});
  expect(()=>actionRequest('admin','set_target',{rep_id:'r1',clinic_id:'c1',product_id:'p1',qty:8},'2026-10')).toThrow('أهداف العيادات القديمة');
  expect(actionRequest('admin','create_clinic',{name:'عيادة جديدة'},'2026-10')).toEqual({url:'/api/admin/forecast/clinics',body:{action:'create',name:'عيادة جديدة'}});
  expect(actionRequest('admin','create_branch',{name:'عيادة جديدة'},'2026-10')).toEqual({url:'/api/admin/forecast/clinics',body:{action:'create_branch',name:'عيادة جديدة'}});
  expect(actionRequest('sales_rep','request_change',{reason:'تعديل',lines:[{clinic_id:'c1',product_id:'p1',qty:7}]},'2026-10').body).toMatchObject({action:'request_change',lines:[{clinic_id:'c1',product_id:'p1',quantity:7}]});
 });
 it('reports quantity and value by rep, clinic and product without counting pending sales',()=>{const rows=buildReportRows({targets:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',qty:10,unit_price:'12.00'}],approved_forecasts:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',quantity:9}],approved_sales:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',quantity:4,unit_price:'15.00',kind:'sale',direction:1},{rep_id:'r1',clinic_id:'c1',product_id:'p1',quantity:1,unit_price:'15.00',kind:'return',direction:1}]});expect(rows).toEqual([{rep_id:'r1',clinic_id:'c1',product_id:'p1',target_qty:10,target_value:120,forecast_qty:9,sold_qty:3,sold_value:45}]);});
 it('allows close control only on Riyadh month last day without pending work',()=>{
  expect(canCloseMonth('2026-10',admin as never,new Date('2026-10-30T22:00:00Z'))).toBe(false);
  expect(canCloseMonth('2026-10',{...admin,pending:[],sales:[]} as never,new Date('2026-10-30T22:00:00Z'))).toBe(true);
 });
 it('routes the legacy /forecast page into the sales hub workspace',()=>{
  const page=readFileSync('src/app/forecast/page.tsx','utf8');
  expect(page).toContain('redirect("/sales?tab=workspace")');
 });
});


describe('clinic identity labels',()=>{
 it('shows stable distinct IDs when independent branches share the same name and city',()=>{
  const clinics=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Same Clinic',city:'Riyadh'},{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Same Clinic',city:'Riyadh'}];
  const html=renderToStaticMarkup(createElement(AdminForecastView,{data:{...admin,clinics},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(html).toContain('Same Clinic — Riyadh · #aaaaaaaa');
  expect(html).toContain('Same Clinic — Riyadh · #bbbbbbbb');
  const rep=renderToStaticMarkup(createElement(ForecastView,{role:'sales_rep',lines:[],onLine:()=>{},onCopy:()=>{},data:{month:'2026-10',clinics,products:[{id:'p1',name:'Product'}],prices:[],forecast:null,targets:[],sales:[],summary:{late_clinics:clinics}},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(rep).toContain('Same Clinic — Riyadh · #aaaaaaaa');
  expect(rep).toContain('Same Clinic — Riyadh · #bbbbbbbb');
 });
 it('disambiguates rep matrix and late clinics by city',()=>{
  const clinic={id:'c1',name:'Same Clinic',city:'Riyadh'};
  const html=renderToStaticMarkup(createElement(ForecastView,{role:'sales_rep',lines:[],onLine:()=>{},onCopy:()=>{},data:{month:'2026-10',clinics:[clinic],products:[{id:'p1',name:'Product'}],prices:[],forecast:null,targets:[],sales:[],summary:{late_clinics:[clinic]}},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(html.match(/Same Clinic — Riyadh/g)?.length).toBeGreaterThanOrEqual(2);
 });
 it('exposes explicit separate-branch action and shows current linked clinic for selected doctors',()=>{
  const html=renderToStaticMarkup(createElement(AdminForecastView,{data:{...admin,doctors:[{...admin.doctors[0],clinic_id:'c1'}]},loading:false,error:'',busy:false,month:'2026-10',onMonth:()=>{},onRetry:()=>{},onAction:()=>{}}));
  expect(html).toContain('إنشاء فرع مستقل');
  expect(html).toContain('الربط الحالي');
 });
});
