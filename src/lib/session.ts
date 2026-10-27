import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db';
import { createSessionToken, hashSessionToken } from './auth';
import type { AppRole } from './permissions';
export type SessionUser = { id: string; name: string; email: string; role: AppRole; assigned_product_id: string | null; product_name: string | null; job_title: string };
const COOKIE = 'elite_session';
export async function createSession(userId: string) {
  const token = createSessionToken();
  await query('INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,now()+interval \'14 days\')', [userId, hashSessionToken(token)]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60*60*24*14 });
}
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = await query<SessionUser>(`SELECT u.id,u.name,u.email,u.role,u.assigned_product_id,u.job_title,p.name product_name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN products p ON p.id=u.assigned_product_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [hashSessionToken(token)]);
  return r.rows[0] ?? null;
}
export async function requireUser() { const user = await getCurrentUser(); if (!user) redirect('/login'); return user; }
export async function destroySession() { const store = await cookies(); const token=store.get(COOKIE)?.value; if(token) await query('DELETE FROM sessions WHERE token_hash=$1',[hashSessionToken(token)]); store.delete(COOKIE); }
