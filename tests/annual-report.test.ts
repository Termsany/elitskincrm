import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
const {query,user}=vi.hoisted(()=>({query:vi.fn(),user:vi.fn()}));
vi.mock('@/lib/db',()=>({query}));
vi.mock('@/lib/session',()=>({getCurrentUser:user}));
import {annualReportSelection,getDetailedReportData} from '@/lib/report-data';
import {GET as api} from '@/app/api/admin/reports/route';
import {GET as exportGet} from '@/app/api/exports/report/route';
const url=(q:string)=>new Request(`http://localhost/api/admin/reports?${q}`);
beforeEach(()=>{query.mockReset();user.mockReset();user.mockResolvedValue({role:'admin'});query.mockResolvedValue({rows:[]});});
describe('annual sales report contract',()=>{
 it('accepts only the complete selected Riyadh calendar year',()=>{
  expect(annualReportSelection(new URLSearchParams('reportType=sales&year=2025&from=2025-01-01&to=2025-12-31&repId=r1&search=Ali'))).toEqual({year:2025,repId:'r1',search:'ali'});
  expect(annualReportSelection(new URLSearchParams('reportType=sales&year=2025'))).toEqual({year:2025,repId:null,search:''});
  for(const invalid of ['year=2025&from=2025-03-01&to=2025-12-31','year=2025&from=2025-01-01','year=2025&from=2025-01-01&to=2026-12-31','year=2025&productId=x','year=2025&city=Riyadh','year=2025&status=completed','year=2025&unknown=x','year=banana','year=2025&year=2026'])expect(()=>annualReportSelection(new URLSearchParams(`reportType=sales&${invalid}`))).toThrow();
 });
 it('gets approved signed detail for the full year only with a year-specific target',async()=>{
  await getDetailedReportData(new URLSearchParams('reportType=sales&year=2025&repId=r1&search=ALI'));
  expect(query).toHaveBeenCalledTimes(1);
  const [sql,values]=query.mock.calls[0];
  expect(sql).toContain('rep_target_years');expect(sql).toContain("fs.status='approved'");expect(sql).toContain("fs.kind='return'");expect(sql).not.toContain('rep_monthly_sales');expect(sql).not.toContain('u.active=true');
  expect(values).toEqual([2025,'2025-01-01','2026-01-01','r1','%ali%']);
 });
 it('rejects partial and unsupported filters before database access on API and export',async()=>{
  for(const [fn,path] of [[api,'/api/admin/reports'],[exportGet,'/api/exports/report']] as const){
   for(const suffix of ['year=2025&city=Jeddah','year=2025&from=2025-02-01&to=2025-12-31','year=2025&from=2025-01-01&to=2026-12-31','year=2025&productId=p1','year=2025&status=completed']){
    const r=await fn(new Request(`http://localhost${path}?reportType=sales&${suffix}`));expect(r.status).toBe(400);
   }
  }
  expect((await api(url('reportType=sales&year=2025&format=csv'))).status).toBe(400);
  expect(query).not.toHaveBeenCalled();
 });
 it('exports the same selected annual rows as API',async()=>{
  query.mockResolvedValue({rows:[{rep_id:'r1',rep_name:'Ali',annual_sales_target:'100',achieved:'30',remaining:'70'}]});
  const apiResponse=await api(url('reportType=sales&year=2025&repId=r1'));
  const exportResponse=await exportGet(new Request('http://localhost/api/exports/report?reportType=sales&year=2025&repId=r1&format=json'));
  expect((await apiResponse.json()).sales).toEqual((await exportResponse.json()).rows);
  expect(query.mock.calls[0]).toEqual(query.mock.calls[1]);
 });
 it('isolates the annual controls from visit and product filters',()=>{
  const source=readFileSync('src/app/admin/reports/ReportsClient.tsx','utf8');
  expect(source).toContain('type==="sales"');expect(source).toContain('q.set("year",year)');expect(source).toContain('type!=="sales"');
 });
});
