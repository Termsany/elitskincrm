"use client";

import { useEffect, useState } from 'react';
import { ACTION_CARDS, type ActionCenterData } from '@/lib/admin-action-center';
import { SkeletonCard } from '@/components/ui';

const number = new Intl.NumberFormat('ar-SA');
const stamp = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' });

export async function fetchActionCenter(signal: AbortSignal): Promise<ActionCenterData> {
  const response = await fetch('/api/admin/action-center', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('تعذر تحميل مركز الإجراءات');
  const data = await response.json() as ActionCenterData;
  // Never interpret missing/malformed counts as zero.
  if (!data || !data.counts || !ACTION_CARDS.every(card => Number.isSafeInteger(data.counts[card.key]) && data.counts[card.key] >= 0)
      || !Array.isArray(data.queue) || !Number.isFinite(Date.parse(data.generated_at))
      || !/^\d{4}-\d{2}-\d{2}$/.test(data.riyadh_date) || !Number.isSafeInteger(data.queueLimit) || data.queueLimit < 1
      || data.queue.length > data.queueLimit || !data.queue.every(item => item && typeof item.id === 'string' && typeof item.title === 'string'
        && (item.owner === null || typeof item.owner === 'string') && Number.isFinite(Date.parse(item.created_at)) && ACTION_CARDS.some(card => card.key === item.kind))) {
    throw new Error('بيانات مركز الإجراءات غير مكتملة');
  }
  return data;
}

type ViewProps = { data: ActionCenterData|null; loading:boolean; error:string|null; onRetry:()=>void };
export function ActionCenterView({ data, loading, error, onRetry }: ViewProps) {
  const total = data ? ACTION_CARDS.reduce((sum, card) => sum + data.counts[card.key], 0) : 0;
  return <section dir="rtl" aria-label="مركز الإجراءات" aria-busy={loading} className="rounded-3xl border border-[var(--border)] bg-white p-4 sm:p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-extrabold text-[var(--navy)] sm:text-xl">مركز الإجراءات</h2>
        <p className="mt-1 text-xs leading-6 text-[var(--muted)]">كل الفترات · إجمالي الأعمال المعلقة حاليًا لكل المناديب، وليس نشاط الشهر.</p>
        {data && <p className="text-xs leading-6 text-[var(--muted)]">آخر تحديث: <time dateTime={data.generated_at}>{stamp.format(new Date(data.generated_at))}</time> · توقيت الرياض<br/>المتأخر: استحقاق قبل {data.riyadh_date}، ولا يشمل اليوم.</p>}
      </div>
      <button type="button" disabled={loading} onClick={onRetry} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--navy)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">{loading ? 'جارٍ التحديث…' : 'تحديث'}</button>
    </div>
    {loading && !data && <div role="status" aria-label="جارٍ تحميل الإجراءات" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{error}{data ? ' · الأرقام المعروضة قديمة من آخر تحميل ناجح.' : ' · لم تُحمّل الأعداد، وليست صفرًا.'}</p>
      <button type="button" disabled={loading} onClick={onRetry} className="mt-2 min-h-11 rounded-lg border border-red-300 bg-white px-4 font-bold disabled:opacity-50">إعادة المحاولة</button>
    </div>}
    {data && <>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTION_CARDS.map(card => <a key={card.key} href={card.href} className="group flex min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          <span className="text-sm font-bold text-[var(--navy)]">{card.label}</span>
          <span className={`my-2 text-3xl font-extrabold tabular-nums ${card.key === 'overdueTasks' && data.counts[card.key] > 0 ? 'text-red-700' : 'text-[var(--navy)]'}`}>{number.format(data.counts[card.key])}</span>
          <span className="mb-3 text-xs leading-5 text-[var(--muted)]">{card.detail}</span>
          <span className="mt-auto text-sm font-bold text-sky-800">{card.action} ←</span>
        </a>)}
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-extrabold text-[var(--navy)]">أحدث إجراءات تحتاج متابعة</h3>
        <p className="mt-1 text-xs leading-6 text-[var(--muted)]">عرض {number.format(data.queue.length)} من أصل {number.format(total)} إجراء · أحدث {number.format(data.queueLimit)} كحد أقصى حسب تاريخ الإنشاء عبر كل الأنواع. أعداد البطاقات إجمالية وغير محدودة بهذه القائمة.</p>
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {data.queue.map(item => {
            const card = ACTION_CARDS.find(card => card.key === item.kind)!;
            return <li key={`${item.kind}:${item.id}`}><a href={card.href} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600">
              <span className="min-w-0 flex-1 basis-48"><span className="block break-words text-sm font-bold text-[var(--navy)]">{item.title}</span><span className="text-xs text-[var(--muted)]">{card.label}{item.owner ? ` · ${item.owner}` : ''} · {stamp.format(new Date(item.created_at))}</span></span>
              <span className="text-xs font-bold text-sky-800">{card.action} ←</span>
            </a></li>;
          })}
        </ul>
        {total === 0 && <p className="mt-3 text-sm text-emerald-800">لا توجد إجراءات معلقة ضمن هذه الفئات.</p>}
        <p className="mt-3 text-xs text-[var(--muted)]">الروابط تفتح صفحات المتابعة الحالية؛ اختر الإجراء داخل الصفحة.</p>
      </div>
    </>}
  </section>;
}

export default function AdminActionCenter() {
  const [data, setData] = useState<ActionCenterData|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchActionCenter(controller.signal).then(snapshot => {
      if (!controller.signal.aborted) setData(snapshot);
    }).catch(() => {
      if (!controller.signal.aborted) setError('تعذر تحميل مركز الإجراءات. تحقق من الاتصال أو صلاحية الجلسة.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  return <ActionCenterView data={data} error={error} loading={loading} onRetry={() => setRevision(value => value + 1)} />;
}
