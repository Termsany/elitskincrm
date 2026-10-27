import { describe, expect, it } from 'vitest';
import { buildDoctorTimeline } from '@/lib/doctor-timeline';

describe('buildDoctorTimeline', () => {
  it('merges visits, followups, tasks and plans into one list sorted newest/soonest first', () => {
    const events = buildDoctorTimeline({
      visits: [{ id: 'v1', visited_at: '2026-01-10T10:00:00Z', notes: '', status: 'completed', rep_name: null, follow_up_at: null, follow_up_note: '', items: [], presented: [], attachments: [] }] as any,
      followups: [{ id: 'f1', title: 'متابعة', note: '', due_at: '2026-02-01', status: 'open', product_name: null, rep_name: null }],
      tasks: [{ id: 't1', title: 'مهمة', priority: 'high', due_date: '2026-01-20', status: 'pending' }],
      plans: [{ id: 'p1', plan_id: 'plan1', planned_date: '2026-03-01', note: '', priority: 'normal', product_name: null, rep_name: null }],
    });
    expect(events.map((e) => e.type)).toEqual(['planned_visit', 'followup', 'task', 'visit']);
  });

  it('skips tasks without a due date, since they have no point in time to place on the log', () => {
    const events = buildDoctorTimeline({
      visits: [],
      followups: [],
      tasks: [{ id: 't1', title: 'مهمة بلا موعد', priority: 'low', due_date: null, status: 'pending' }],
      plans: [],
    });
    expect(events).toHaveLength(0);
  });
});
