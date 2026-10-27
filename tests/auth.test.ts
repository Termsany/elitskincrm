import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, hashSessionToken } from '@/lib/auth';

describe('authentication primitives', () => {
  it('hashes passwords and verifies only the correct password', async () => {
    const hash = await hashPassword('StrongPassword!42');
    expect(hash).not.toContain('StrongPassword!42');
    await expect(verifyPassword('StrongPassword!42', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('creates an opaque token and a deterministic non-reversible digest', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
