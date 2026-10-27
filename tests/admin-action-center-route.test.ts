import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/session',()=>({getCurrentUser:mocks.session}));
vi.mock('@/lib/db',()=>({query:mocks.query}));
import { GET } from '@/app/api/admin/action-center/route';
describe('admin action center authorization and failures',()=>{
 beforeEach(()=>{vi.resetAllMocks();});
 it('denies missing sessions before querying counts',async()=>{mocks.session.mockResolvedValue(null);const r=await GET();expect(r.status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();});
 it('denies non-admin sessions before querying counts',async()=>{mocks.session.mockResolvedValue({role:'sales_rep'});expect((await GET()).status).toBe(403);expect(mocks.query).not.toHaveBeenCalled();});
 it('returns the real query result with no caching',async()=>{mocks.session.mockResolvedValue({role:'admin'});const row={counts:{pendingPlans:14},queue:[],generated_at:'2026-10-25T00:00:00Z',riyadh_date:'2026-10-25'};mocks.query.mockResolvedValue({rows:[row]});const r=await GET();expect(r.status).toBe(200);expect(await r.json()).toEqual({...row,queueLimit:6});expect(r.headers.get('cache-control')).toContain('no-store');expect(mocks.query.mock.calls[0][1]).toEqual(['pending',['pending','in_progress','needs_info','approved','deferred','reopened'],['pending','in_progress'],'Asia/Riyadh',6]);});
 it('returns an error, never zero counts, when the database fails',async()=>{mocks.session.mockResolvedValue({role:'admin'});mocks.query.mockRejectedValue(new Error('internal SQL detail'));const r=await GET();expect(r.status).toBe(503);const body=await r.json();expect(body).not.toHaveProperty('counts');expect(JSON.stringify(body)).not.toContain('internal SQL');});
 it('handles session-store failures without leaking details',async()=>{mocks.session.mockRejectedValue(new Error('secret'));expect((await GET()).status).toBe(503);});
});
