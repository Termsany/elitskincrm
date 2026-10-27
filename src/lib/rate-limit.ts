// Persistent, cross-instance rate limiting backed by the login_attempts table
// (counter sliding window + temporary block). Survives container restarts and
// is shared across all app instances — unlike a per-process in-memory map.
import { pool, query } from "./db";

export type RlResult = { allowed: boolean; retryAfterMs: number };

type Row = { attempts: number; window_started_at: Date; blocked_until: Date | null; now: Date };

/**
 * Registers one hit against `key`. Within `windowMs` the counter accumulates;
 * once it exceeds `limit` the key is blocked for `blockMs` (defaults to the
 * window). Row-locked in a transaction so concurrent requests can't race past
 * the limit. Returns whether the hit is allowed and, if not, how long to wait.
 */
export async function hitRateLimitDb(
  key: string,
  limit: number,
  windowMs: number,
  blockMs = windowMs,
): Promise<RlResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO login_attempts(key, attempts, window_started_at) VALUES($1,0,now()) ON CONFLICT (key) DO NOTHING",
      [key],
    );
    const { rows } = await client.query<Row>(
      "SELECT attempts, window_started_at, blocked_until, now() AS now FROM login_attempts WHERE key=$1 FOR UPDATE",
      [key],
    );
    const r = rows[0];
    const now = r.now.getTime();

    if (r.blocked_until && r.blocked_until.getTime() > now) {
      await client.query("COMMIT");
      return { allowed: false, retryAfterMs: r.blocked_until.getTime() - now };
    }
    if (r.window_started_at.getTime() + windowMs <= now) {
      await client.query(
        "UPDATE login_attempts SET attempts=1, window_started_at=now(), blocked_until=NULL WHERE key=$1",
        [key],
      );
      await client.query("COMMIT");
      return { allowed: true, retryAfterMs: 0 };
    }

    const attempts = r.attempts + 1;
    if (attempts > limit) {
      await client.query(
        "UPDATE login_attempts SET attempts=$2, blocked_until=now() + ($3 * interval '1 millisecond') WHERE key=$1",
        [key, attempts, blockMs],
      );
      await client.query("COMMIT");
      return { allowed: false, retryAfterMs: blockMs };
    }
    await client.query("UPDATE login_attempts SET attempts=$2 WHERE key=$1", [key, attempts]);
    await client.query("COMMIT");
    return { allowed: true, retryAfterMs: 0 };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Read-only: milliseconds left on an active block for `key`, or 0 if not blocked. */
export async function peekBlockedDb(key: string): Promise<number> {
  const { rows } = await query<{ ms: string }>(
    "SELECT CEIL(EXTRACT(EPOCH FROM (blocked_until - now())) * 1000)::bigint AS ms FROM login_attempts WHERE key=$1 AND blocked_until IS NOT NULL AND blocked_until > now()",
    [key],
  );
  return rows[0] ? Number(rows[0].ms) : 0;
}

/** Clears the counter/block for `key` (e.g. after a successful login). */
export async function clearRateLimitDb(key: string): Promise<void> {
  await query("DELETE FROM login_attempts WHERE key=$1", [key]);
}
