import { randomBytes, createHash } from 'node:crypto';
import { issueAccess } from './tokens.mjs';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const h = (t) => createHash('sha256').update(t).digest('hex');

export function createRefreshStore({ users, clock = () => Date.now() } = {}) {
  const store = new Map();

  function issue(sub, family = randomBytes(8).toString('hex')) {
    const token = randomBytes(32).toString('base64url');
    store.set(h(token), { sub, family, exp: clock() + REFRESH_TTL_MS, used: false });
    return token;
  }

  function refresh(token) {
    const rec = store.get(h(token));
    if (!rec) return { ok: false, reason: 'unknown' };
    if (rec.used) {
      for (const r of store.values()) if (r.family === rec.family) r.used = true;
      return { ok: false, reason: 'reused' };
    }
    if (rec.exp <= clock()) return { ok: false, reason: 'expired' };
    if (users && !users.has(rec.sub)) return { ok: false, reason: 'no_user' };
    rec.used = true;
    const user = users?.get(rec.sub);
    return {
      ok: true,
      access: issueAccess(rec.sub, user?.roles ?? [], { now: clock() }),
      refresh: issue(rec.sub, rec.family),
    };
  }

  return { issue, refresh, _store: store };
}
