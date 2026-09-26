import { verifyPassword } from './passwords.mjs';
import { normaliseEmail } from './validation.mjs';

export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function createLoginService({ users, clock = () => Date.now(), audit = () => {} }) {
  const failures = new Map();

  function login(email, password, { ip } = {}) {
    const key = normaliseEmail(email);
    const state = failures.get(key) ?? { count: 0, lockedUntil: 0 };
    if (state.lockedUntil > clock()) {
      audit({ type: 'login.locked', email: key, ip });
      return { ok: false, reason: 'locked' };
    }
    const user = users.get(key);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      state.count += 1;
      if (state.count >= MAX_ATTEMPTS) {
        state.lockedUntil = clock() + LOCK_MS;
        state.count = 0;
        audit({ type: 'account.locked', email: key, ip });
      }
      failures.set(key, state);
      audit({ type: 'login.failed', email: key, ip });
      return { ok: false, reason: 'invalid_credentials' };
    }
    if (!user.emailVerified) return { ok: false, reason: 'unverified' };
    failures.delete(key);
    audit({ type: 'login.succeeded', email: key, ip });
    return { ok: true, user };
  }

  function isLocked(email) {
    return (failures.get(normaliseEmail(email))?.lockedUntil ?? 0) > clock();
  }

  return { login, isLocked };
}
