import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionCenterView, fetchActionCenter } from '@/app/AdminActionCenter';
import type { ActionCenterData } from '@/lib/admin-action-center';
const data:ActionCenterData={counts:{pendingPlans:12,pendingDoctorRequests:1,activeServiceRequests:2,overdueTasks:2,overdueFollowups:1},queue:[{id:'p1',kind:'pendingPlans',title:'خطة <script>',owner:'مندوب',created_at:'2026-10-25T00:00:00Z'}],generated_at:'2026-10-25T00:00:00Z',riyadh_date:'2026-10-25',queueLimit:6};
const render=(props:Partial<Parameters<typeof ActionCenterView>[0]>)=>renderToStaticMarkup(createElement(ActionCenterView,{data:null,loading:false,error:null,onRetry:()=>{},...props}));
afterEach(()=>vi.unstubAllGlobals());
describe('admin action center presentation and loading contract',()=>{
 it('shows loading without fabricated zeros',()=>{const html=render({loading:true});expect(html).toContain('جارٍ تحميل');expect(html).not.toContain('>٠<');expect(html).not.toContain('>0<');});
 it('shows error and retry without claiming an empty queue',()=>{const html=render({error:'تعذر التحميل'});expect(html).toContain('role="alert"');expect(html).toContain('إعادة المحاولة');expect(html).not.toContain('لا توجد إجراءات');});
 it('labels all-time totals, Riyadh date, bounded recent queue and real protected destinations',()=>{const html=render({data});expect(html).toContain('كل الفترات');expect(html).toContain('الرياض');expect(html).toContain('آخر تحديث');expect(html).toContain('من أصل');expect(html).toContain('href="/plans?status=pending"');expect(html).toContain('href="/admin/requests"');expect(html).toContain('href="/tasks"');expect(html).toContain('&lt;script&gt;');expect(html).toContain('grid-cols-1');});
 it('keeps last successful totals explicitly stale after a failed refresh',()=>{const html=render({data,error:'تعذر التحديث'});expect(html).toContain('قديمة');expect(html).toContain('مراجعة الخطط');});
 it('rejects failed responses rather than using their counts',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({counts:{}})}));await expect(fetchActionCenter(new AbortController().signal)).rejects.toThrow();});
 it('rejects malformed successful data instead of displaying fallback zeros',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({})}));await expect(fetchActionCenter(new AbortController().signal)).rejects.toThrow();});
 it('loads a valid snapshot with no-store and abort support',async()=>{const signal=new AbortController().signal;const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>data});vi.stubGlobal('fetch',fetcher);expect(await fetchActionCenter(signal)).toEqual(data);expect(fetcher).toHaveBeenCalledWith('/api/admin/action-center',{cache:'no-store',signal});});
});
