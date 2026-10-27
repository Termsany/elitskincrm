import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { query } from '@/lib/db';
import { ACTION_CENTER_SQL, ACTION_CENTER_VALUES, type ActionCenterData } from '@/lib/admin-action-center';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    // Uses the existing DB-backed session: expiry, active account and current role.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    const result = await query<Omit<ActionCenterData, 'queueLimit'>>(ACTION_CENTER_SQL, [...ACTION_CENTER_VALUES]);
    if (!result.rows[0]) throw new Error('Missing action center snapshot');
    return NextResponse.json({ ...result.rows[0], queueLimit: ACTION_CENTER_VALUES[4] }, { headers });
  } catch {
    return NextResponse.json({ error: 'تعذر تحميل مركز الإجراءات. حاول مرة أخرى.' }, { status: 503, headers });
  }
}
