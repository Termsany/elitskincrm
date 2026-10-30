import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const mock = vi.hoisted(() => ({ user: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mock.user }));
vi.mock('@/lib/db', () => ({ query: mock.query }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw Error('redirect'); }) }));
vi.mock('@/app/admin/rep/[id]/RepLifecycleActions', () => ({ default: () => null }));
import DashboardPage from '@/app/page';
import RepsPage from '@/app/admin/reps/page';
import RepPage from '@/app/admin/rep/[id]/page';
import RepDetailClient from '@/app/admin/rep/[id]/RepDetailClient';
import { getDetailedReportData } from '@/lib/report-data';

beforeEach(() => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2025-12-31T22:30:00Z'));
 mock.user.mockResolvedValue({ id: 'rep-1', role: 'sales_rep', email: 'rep@example.com', name: 'مندوب' });
 mock.query.mockResolvedValue({ rows: [] });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const salesSql = () => (mock.query.mock.calls as [string, unknown[]][]).filter(([sql]) => /forecast_sales|rep_monthly_sales|rep_target_years/.test(sql));
const assertApprovedSigned = (sql: string) => {
 expect(sql).toContain('forecast_sales'); expect(sql).toMatch(/status\s*=\s*'approved'/);
 expect(sql).toMatch(/quantity\s*\*\s*(?:s\.|fs\.)?unit_price/);
 expect(sql).toMatch(/kind\s*=\s*'return'/); expect(sql).toContain('direction');
 expect(sql).not.toContain('rep_monthly_sales');
};
describe('annual targets and approved forecast achievement across dashboards', () => {
 it('home reads the Riyadh-year target and signed approved sales only', async () => {
  await DashboardPage();
  const calls = salesSql(); expect(calls.some(([sql]) => sql.includes('rep_monthly_sales'))).toBe(false);
  expect(calls.some(([sql, args]) => sql.includes('rep_target_years') && args?.includes(2026))).toBe(true);
  const actual = calls.find(([sql]) => sql.includes('forecast_sales'))!;
  assertApprovedSigned(actual[0]); expect(actual[1]).toEqual(['rep-1', 2026, '2026-01-01', '2027-01-01']);
 });
 it('admin list computes the current Riyadh-year values per rep without legacy amounts', async () => {
  mock.user.mockResolvedValue({ id: 'admin-1', role: 'admin' }); await RepsPage();
  const [sql, args] = mock.query.mock.calls[0]; assertApprovedSigned(sql);
  expect(sql).toContain('rep_target_years'); expect(sql).not.toMatch(/u\.annual_sales_target/); expect(args).toEqual([2026, '2026-01-01', '2027-01-01']);
 });
 it('admin detail shows a read-only approved sales ledger and no manual monthly POST', async () => {
  mock.user.mockResolvedValue({ id: 'admin-1', role: 'admin' }); await RepPage({ params: Promise.resolve({ id: 'rep-1' }) }).catch(() => {});
  const calls = mock.query.mock.calls as [string, unknown[]][];
  expect(calls.some(([sql]) => sql.includes('rep_monthly_sales'))).toBe(false);
  expect(calls.some(([sql]) => sql.includes('rep_target_years'))).toBe(true);
  expect(calls.some(([sql]) => sql.includes('forecast_sales') && /status\s*=\s*'approved'/.test(sql))).toBe(true);
  const html = renderToStaticMarkup(createElement(RepDetailClient, {
   initial: { id:'rep-1', name:'مندوب', email:'rep@example.com', active:true, university:'', hire_date:null, iqama_expiry:null, salary:0, annual_sales_target:1000, annual_sales:0, products:[], visits_count:0, plans_count:0, samples_count:0, open_tasks:0, open_requests:0, last_visit:null },
   products:[], sales:[], visits:[], plans:[], samples:[], tasks:[], requests:[]
  }));
  expect(html).toContain('لا توجد مبيعات معتمدة');
  expect(html).not.toContain('إدخال المبيعات الشهرية');
  const source = readFileSync('src/app/admin/rep/[id]/RepDetailClient.tsx', 'utf8');
  expect(source).not.toMatch(/method:\s*['"]POST['"]/);
  expect(source).not.toContain('إدخال المبيعات الشهرية');
  expect(source).toContain('annual_sales_target:Number(r.annual_sales_target)');
  expect(readFileSync('src/app/admin/rep/[id]/page.tsx','utf8')).toContain('annual_sales_target:Number(r.rows[0].annual_sales_target)');
 });
 it('report sales uses approved signed values and selected Riyadh dates, not legacy', async () => {
  await getDetailedReportData(new URLSearchParams('from=2026-01-01&to=2026-02-28&repId=rep-1'));
  const [sql, args] = mock.query.mock.calls.find(([text]: [string]) => text.includes(' AS achieved'))!;
  assertApprovedSigned(sql); expect(sql).toContain('rep_target_years'); expect(sql).not.toMatch(/u\.annual_sales_target/);
  expect(args).toContain('2026-01-01'); expect(args).toContain('2026-02-28');
 });
});
