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
 it('shows unallocated months instead of fabricating target divided by twelve',()=>{
  const html=render({monthlyTargets:[{month_value:'2026-01-01',amount:'300'}]});
  expect(html).toContain('غير مخصص');expect(html).toContain('300 ريال');expect(html).not.toContain('100 ريال');
 });
 it('shows signed monthly actuals and does not invent a target variance for unallocated months',()=>{
  const html=render({sales:[{month_value:'2026-01-01',amount:'-25'},{month_value:'2026-02-01',amount:'125'}],monthlyTargets:[]});
  expect(html).toContain('-25 ريال');expect(html).toContain('125 ريال');expect(html).not.toContain('حقق الهدف');expect(html).not.toContain('أقل من الهدف');
 });
});
