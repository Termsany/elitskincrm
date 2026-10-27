import { describe, expect, it } from 'vitest';
import { doctorProfileQueries } from '@/lib/doctor-profile';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DoctorProfile from '@/components/DoctorProfile';

it('renders an honest empty state and uses the existing doctorId preselection without guessing directions', () => {
  const html = renderToStaticMarkup(createElement(DoctorProfile, {
    isAdmin: false,
    doctor: { id: 'd1', name: 'طبيب الاختبار', clinic_name: '', city: 'الرياض', specialty: '', classification: '', phone: '', email: '', status: 'active' },
    summary: { total_visits: 0, completed_visits: 0, last_visit_at: null },
    timeline: [],
  }));
  expect(html).toContain('/visits/new?doctorId=d1');
  expect(html).toContain('لا يوجد سجل تفاعل بعد');
  expect(html).not.toContain('maps.google');
  expect(html).not.toContain('tel:');
});

describe('doctor profile SQL access boundary', () => {
  it('keeps shared doctor master data but scopes every activity query to the rep', () => {
    const q = doctorProfileQueries({ id: 'rep-one', role: 'sales_rep' }, 'doctor-one');
    expect(q.doctor.values).toEqual(['doctor-one']);
    expect(q.visits.text).toContain('v.sales_rep_id = $2');
    expect(q.summary.text).toContain('v.sales_rep_id = $2');
    expect(q.plans.text).toContain('p.user_id = $2');
    expect(q.tasks.text).toContain('ta.user_id = $2');
    expect(q.followups.text).toContain('f.sales_rep_id = $2');
    expect(q.visits.text).toContain('visit_presented_products');
    expect(q.visits.text).toContain('visit_attachments');
    expect(q.visits.text).toContain('attachments');
    for (const name of ['visits', 'summary', 'plans', 'tasks', 'followups'] as const) {
      expect(q[name].values).toEqual(['doctor-one', 'rep-one']);
      expect(q[name].text).not.toContain('json_agg(ta');
    }
    expect(q.tasks.text).toContain('ta.status::text');
    expect(q.tasks.text).not.toContain('t.description');
    expect(q.tasks.text).not.toContain('creator_name');
  });
});
