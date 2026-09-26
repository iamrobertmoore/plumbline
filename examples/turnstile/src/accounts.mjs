import { normaliseEmail, validateEmail, validatePassword } from './validation.mjs';
import { hashPassword } from './passwords.mjs';

export function createAccounts({ users, verifier, sessions }) {
  function register(email, password) {
    const key = normaliseEmail(email);
    if (!validateEmail(key)) return { ok: false, reason: 'bad_email' };
    const errors = validatePassword(password, { email: key });
    if (errors.length) return { ok: false, reason: 'weak_password', errors };
    if (users.has(key)) return { ok: false, reason: 'exists' };
    users.set(key, { email: key, passwordHash: hashPassword(password), emailVerified: false, roles: ['user'] });
    const verifyToken = verifier.issue(key);
    return { ok: true, verifyToken };
  }

  function remove(email) {
    const key = normaliseEmail(email);
    users.delete(key);
    sessions?.destroyAllFor(key);
    return { ok: true };
  }

  return { register, remove };
}
