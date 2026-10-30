import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ForecastView, postForecastAction, fetchForecast, previousMonth, fetchPreviousMonthLines, riyadhMonth, normalizeRepForecast, paceForMonth, actionRequest } from '@/app/forecast/ForecastClient';
import type { ForecastData } from '@/app/forecast/ForecastClient';

const data: ForecastData = {
 month: '2026-10', clinics: [{id:'c1',name:'عيادة الندى',doctor_count:2}], products:[{id:'p1',name:'منتج أ'}],
 prices:[], forecast:{id:'f1',status:'draft',lines:[{clinic_id:'c1',product_id:'p1',qty:5}]},
 targets:[{rep_id:'r1',clinic_id:'c1',product_id:'p1',qty:12}], sales:[],
 summary:{target_qty:12,sold_qty:4,pacing_qty:6,late_clinics:[{id:'c1',name:'عيادة الندى'}]}
};
const render=(overrides:Record<string,unknown>={})=>renderToStaticMarkup(createElement(ForecastView,{
 role:'sales_rep',data,loading:false,error:'',busy:false,month:riyadhMonth(new Date()),lines:data.forecast.lines,
 onMonth:()=>{},onRetry:()=>{},onLine:()=>{},onCopy:()=>{},onAction:()=>{},...overrides
}));
afterEach(()=>vi.unstubAllGlobals());
describe('forecast workspace',()=>{
 it('shows real clinic product quantities, separate official target, pace and sale action',()=>{
  const html=render();
  expect(html).toContain('عيادة الندى'); expect(html).toContain('منتج أ');
  expect(html).toContain('الهدف الرسمي'); expect(html).toContain('١٢');
  expect(html).toContain('متأخرة'); expect(html).toContain('تسجيل بيع');
  expect(html).toContain('قيمة الهدف الرسمي'); expect(html).toContain('قيمة المبيعات المعتمدة');
  expect(html).toContain('تسجيل مرتجع'); expect(html).toContain('تصحيح بيع');
  expect(html).toContain('نسخ الشهر السابق'); expect(html).toContain('حفظ مسودة'); expect(html).toContain('إرسال للمراجعة');
 });
 it('never renders zero metrics on load failure and offers retry',()=>{
  const html=render({data:null,error:'فشل التحميل'});
  expect(html).toContain('فشل التحميل'); expect(html).toContain('إعادة المحاولة');
  expect(html).not.toContain('المبيعات المعتمدة');
 });
 it('allows proposing revised quantities without directly mutating approved forecast',()=>{
  const html=render({data:{...data,forecast:{...data.forecast,status:'approved'}}});
  expect(html).toContain('طلب تعديل'); expect(html).not.toContain('حفظ مسودة'); expect(html).not.toMatch(/aria-label="كمية منتج أ في عيادة الندى"[^>]*disabled/);
 });
 it('shows immutable approved forecast value alongside a newly proposed price',()=>{const html=render({data:{...data,prices:[{clinic_id:'c1',product_id:'p1',price:20}],forecast:{id:'f1',status:'approved',lines:[{clinic_id:'c1',product_id:'p1',qty:5,unit_price:'12.00'}]}}});expect(html).toContain('قيمة النسخة المعتمدة');expect(html).toContain('٦٠');});
 it('does not allow a change request for a historical open month',()=>{const html=render({month:'2020-01',data:{...data,month:'2020-01',forecast:{id:'f1',status:'approved',lines:data.forecast.lines}}});expect(html).not.toContain('سبب طلب التعديل');});
 it('shows rejected revision separately from the still-approved baseline',()=>{const normalized=normalizeRepForecast({...data,forecast:[{id:'f2',version:2,status:'rejected',review_note:'سبب رفض',clinic_id:'c1',product_id:'p1',quantity:9,unit_price:'20.00'},{id:'f1',version:1,status:'approved',clinic_id:'c1',product_id:'p1',quantity:5,unit_price:'12.00'}]});expect(normalized.forecast?.status).toBe('rejected');expect(normalized.forecast?.lines[0].qty).toBe(9);expect(normalized.forecast?.rejection_reason).toBe('سبب رفض');expect(normalized.approved_baseline?.status).toBe('approved');expect(normalized.approved_baseline?.lines[0].qty).toBe(5);expect(normalized.summary.forecast_qty).toBe(5);const html=render({data:normalized,lines:normalized.forecast?.lines??[]});expect(html).toContain('التوقع المعتمد الساري');expect(html).toContain('مقترح التعديل المرفوض');expect(html).toContain('سبب الرفض: سبب رفض');expect(html).toContain('٩');expect(html).toContain('٦٠');expect(html).not.toContain('حفظ مسودة');expect(html).toContain('طلب تعديل');});
 it('subtracts approved negative corrections from clinic pacing',()=>{const result=paceForMonth('2026-10',[{clinic_id:'c1',product_id:'p1',qty:10,rep_id:'r1'}],[{id:'s1',clinic_id:'c1',product_id:'p1',qty:8,status:'approved',kind:'sale'},{id:'s2',clinic_id:'c1',product_id:'p1',qty:5,status:'approved',kind:'adjustment',direction:-1}],[{id:'c1',name:'عيادة الندى'}],new Date('2026-10-15T12:00:00Z'));expect(result.late_clinics.map(x=>x.id)).toEqual(['c1']);});
 it('separates effective approved baseline from a pending revision',()=>{const normalized=normalizeRepForecast({...data,forecast:[{id:'f2',version:2,status:'pending',clinic_id:'c1',product_id:'p1',quantity:9,unit_price:'20.00'},{id:'f1',version:1,status:'approved',clinic_id:'c1',product_id:'p1',quantity:5,unit_price:'12.00'}]});expect(normalized.approved_baseline?.lines[0].qty).toBe(5);expect(normalized.forecast?.lines[0].qty).toBe(9);expect(normalized.summary.forecast_qty).toBe(5);const html=render({data:normalized,lines:normalized.forecast?.lines??[]});expect(html).toContain('التوقع المعتمد الساري');expect(html).toContain('مقترح التعديل المعلّق');expect(html).toContain('٦٠');});
 it('disables late submission but leaves draft save available',()=>{const html=render({data:{...data,is_late:true}});expect(html).toContain('حفظ مسودة');expect(html).toMatch(/disabled=""[^>]*>إرسال للمراجعة/);});
 it('keeps historical months read-only instead of offering a save the backend rejects',()=>{
  const html=render({month:'2020-01',data:{...data,month:'2020-01'}});
  expect(html).not.toContain('حفظ مسودة');
  expect(html).not.toContain('نسخ الشهر السابق');
 });
 it('sends exact action and month to the protected API and reports errors',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:'مغلق'})}));
  await expect(postForecastAction('/api/forecast',{action:'submit',month:'2026-10'})).rejects.toThrow('مغلق');
  expect(fetch).toHaveBeenCalledWith('/api/forecast',expect.objectContaining({method:'POST',body:JSON.stringify({action:'submit',month:'2026-10'})}));
 });
 it('loads month-scoped data without demo fallbacks',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  expect((await fetchForecast('2026-10','sales_rep')).clinics[0].id).toBe('c1');
  expect(fetch).toHaveBeenCalledWith('/api/forecast?month=2026-10',expect.objectContaining({cache:'no-store'}));
 });
 it('loads previous December by server month rather than invented local data',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...data,month:'2025-12'})}));
  expect(previousMonth('2026-01')).toBe('2025-12');
  expect(await fetchPreviousMonthLines('2026-01')).toEqual(data.forecast.lines);
  expect(fetch).toHaveBeenCalledWith('/api/forecast?month=2025-12',expect.any(Object));
 });
 it('normalizes backend version rows and quantity without treating forecast as a record',()=>{
  const actual=normalizeRepForecast({...data,forecast:[{id:'f1',status:'pending',clinic_id:'c1',product_id:'p1',quantity:5}],targets:[{clinic_id:'c1',product_id:'p1',quantity:12}],summary:{actual:4,target:12,pace_warning:true}});
  expect(actual.forecast?.lines).toEqual([{clinic_id:'c1',product_id:'p1',qty:5}]);
  expect(actual.summary.sold_qty).toBe(4); expect(actual.targets[0].qty).toBe(12);
 });
 it('calculates Riyadh pacing and late clinics from official targets and approved sales',()=>{
  const metrics=paceForMonth('2026-10',[{clinic_id:'c1',product_id:'p1',qty:10,rep_id:'r1'}],[{id:'s1',clinic_id:'c1',product_id:'p1',qty:2,status:'approved'}],[{id:'c1',name:'عيادة الندى'}],new Date('2026-10-15T21:00:00Z'));
  expect(metrics.pacing_qty).toBe(6); expect(metrics.days_remaining).toBe(15);
  expect(metrics.late_clinics.map(c=>c.id)).toEqual(['c1']);
 });
 it('submits a source-linked return instead of overwriting original sale',()=>{
  expect(actionRequest('sales_rep','return',{source_sale_id:'s1',clinic_id:'c1',product_id:'p1',qty:2,reason:'returned'},'2026-10')).toEqual({url:'/api/forecast/sales',body:{month:'2026-10',kind:'return',source_sale_id:'s1',clinic_id:'c1',product_id:'p1',quantity:2,reason:'returned'}});
 });
 it('formats month in Riyadh across a UTC midnight boundary',()=>{
  expect(riyadhMonth(new Date('2026-01-31T22:00:00Z'))).toBe('2026-02');
 });
});
