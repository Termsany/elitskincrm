import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const mock=vi.hoisted(()=>({user:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/session',()=>({getCurrentUser:mock.user}));
vi.mock('@/lib/db',()=>({query:mock.query}));
vi.mock('@/components/AppShell',()=>({AppShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('next/navigation',()=>({redirect:vi.fn(()=>{throw Error('redirect');})}));
import SalesPage from '@/app/sales/page';
import SalesClient from '@/app/sales/SalesClient';
const render=(props:Record<string,unknown>)=>renderToStaticMarkup(createElement(SalesClient,{target:1200,sales:[],suggestions:{unvisitedA:0,missedPlans:0},year:2026,currentMonth:1,monthlyTargets:[],...props}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2025-12-31T22:30:00Z'));mock.user.mockResolvedValue({id:'rep-1',role:'sales_rep',email:'rep@test',name:'Rep'});mock.query.mockImplementation(async (sql:string)=>({rows:sql.includes('annual_sales_target')?[{annual_sales_target:'900'}]:sql.includes('count(*)')?[{cnt:0}]:[]}));});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
describe('sales target redesign',()=>{
 it('reads Riyadh-year approved signed detail at snapshot prices, never legacy totals',async()=>{
  await SalesPage();
  const calls=mock.query.mock.calls as [string,unknown[]][];
  expect(calls.some(([sql])=>sql.includes('rep_monthly_sales'))).toBe(false);
  const sales=calls.find(([sql])=>sql.includes('FROM forecast_sales'));
  expect(sales).toBeDefined();
  expect(sales![0]).toMatch(/status\s*=\s*'approved'/);
  expect(sales![0]).toMatch(/quantity\s*\*\s*unit_price/);
  expect(sales![0]).toMatch(/kind\s*=\s*'return'/);
  expect(sales![0]).toMatch(/direction/);
  expect(sales![1]).toEqual(['rep-1','2026-01-01','2027-01-01']);
  expect(calls.some(([sql])=>sql.includes('rep_target_versions')&&sql.includes("status='approved'"))).toBe(true);
  expect(calls.some(([sql,args])=>sql.includes('rep_target_years')&&args[0]==='rep-1'&&args[1]===2026)).toBe(true);
 });
 it('uses the annual target row and official monthly override ahead of detailed allocation',async()=>{
  mock.query.mockImplementation(async (sql:string)=>({rows:sql.includes('rep_target_years')?[{annual_amount:'2400'}]:sql.includes('rep_target_overrides')?[{month_value:'2026-01-01',amount:'300'}]:sql.includes('rep_target_months')?[{month_value:'2026-01-01',amount:'200'}]:sql.includes('annual_sales_target')?[{annual_sales_target:'900'}]:sql.includes('count(*)')?[{cnt:0}]:[]}));
  const html=renderToStaticMarkup(await SalesPage());
  expect(html).toContain('2,400');expect(html).toContain('300');expect(html).not.toContain('900 ريال');
 });
 it('does not reuse a legacy annual target for an unassigned year',async()=>{
  const html=renderToStaticMarkup(await SalesPage());
  expect(html).toContain('0 ريال');expect(html).not.toContain('900 ريال');
 });
 it('renders a zero override as an assigned month instead of reverting to its detail allocation',async()=>{
  mock.query.mockImplementation(async (sql:string)=>({rows:sql.includes('rep_target_years')?[{annual_amount:'1200'}]:sql.includes('rep_target_overrides')?[{month_value:'2026-01-01',amount:'0'}]:sql.includes('rep_target_months')?[{month_value:'2026-01-01',amount:'200'}]:sql.includes('count(*)')?[{cnt:0}]:[]}));
  const html=renderToStaticMarkup(await SalesPage());
  expect(html).toMatch(/يناير.*?0 ريال.*?0 ريال/s);
  expect(html).not.toMatch(/<td class="p-3">200 ريال<\/td>/);
 });
 it('shows unallocated months instead of fabricating target divided by twelve',()=>{
  const html=render({monthlyTargets:[{month_value:'2026-01-01',amount:'300'}]});
  expect(html).toContain('غير مخصص');expect(html).toContain('300 ريال');expect(html).not.toContain('100 ريال');
 });
 it('shows signed monthly actuals and does not invent a target variance for unallocated months',()=>{
  const html=render({sales:[{month_value:'2026-01-01',amount:'-25'},{month_value:'2026-02-01',amount:'125'}],monthlyTargets:[]});
  expect(html).toContain('-25 ريال');expect(html).toContain('125 ريال');expect(html).not.toContain('حقق الهدف');expect(html).not.toContain('أقل من الهدف');
 });
});
