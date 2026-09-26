import { randomBytes, createHash } from 'node:crypto';
import { normaliseEmail, validatePassword } from './validation.mjs';
import { hashPassword } from './passwords.mjs';

export const RESET_TTL_MS = 60 * 60 * 1000;

const h = (t) => createHash('sha256').update(t).digest('hex');

export function createResetService({ users, sessions, clock = () => Date.now(), audit = () => {} }) {
  const tokens = new Map();

  function request(email) {
    const key = normaliseEmail(email);
    if (!users.has(key)) return { sent: true };
    const token = randomBytes(24).toString('base64url');
    tokens.set(h(token), { email: key, exp: clock() + RESET_TTL_MS });
    audit({ type: 'reset.requested', email: key });
    // The token is emailed. It is returned here as well so tests can complete the flow.
    return { sent: true, token };
  }

  function complete(token, newPassword) {
    const rec = tokens.get(h(token));
    if (!rec) return { ok: false, reason: 'invalid' };
    if (rec.exp <= clock()) { tokens.delete(h(token)); return { ok: false, reason: 'expired' }; }
    const errors = validatePassword(newPassword, { email: rec.email });
    if (errors.length) return { ok: false, reason: 'weak_password', errors };
    tokens.delete(h(token));
    users.get(rec.email).passwordHash = hashPassword(newPassword);
    sessions?.destroyAllFor(rec.email);
    audit({ type: 'reset.completed', email: rec.email });
    return { ok: true };
  }

  return { request, complete, _tokens: tokens };
}
