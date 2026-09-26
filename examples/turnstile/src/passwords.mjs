import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyPassword(pw, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(pw, Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function needsRehash(stored) {
  const N = Number(String(stored).split('$')[1]);
  return !(N >= SCRYPT.N);
}
