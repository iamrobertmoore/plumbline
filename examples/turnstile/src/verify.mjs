import { randomBytes } from 'node:crypto';

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export function createVerifier({ users, clock = () => Date.now() }) {
  const pending = new Map();

  function issue(email) {
    const token = randomBytes(24).toString('base64url');
    pending.set(token, { email, exp: clock() + VERIFY_TTL_MS });
    return token;
  }

  function confirm(token) {
    const rec = pending.get(token);
    if (!rec) return { ok: false, reason: 'invalid' };
    pending.delete(token);
    if (rec.exp <= clock()) return { ok: false, reason: 'expired' };
    users.get(rec.email).emailVerified = true;
    return { ok: true };
  }

  return { issue, confirm };
}
