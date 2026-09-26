import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.mjs';

export const ACCESS_TTL_SECONDS = 3600;
export const CLOCK_SKEW_SECONDS = 30;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const revoked = new Set();

export function sign(data, key = config.secret) {
  return createHmac('sha256', key).update(data).digest('base64url');
}

export function issueAccess(sub, roles = [], { now = Date.now(), key } = {}) {
  const iat = Math.floor(now / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub, roles, iat, exp: iat + ACCESS_TTL_SECONDS, jti: randomBytes(12).toString('base64url'), iss: config.issuer });
  return `${header}.${payload}.${sign(`${header}.${payload}`, key)}`;
}

export function revoke(jti) {
  revoked.add(jti);
}

export function verifyAccess(token, { now = Date.now(), key } = {}) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [h, p, s] = parts;
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url'));
    claims = JSON.parse(Buffer.from(p, 'base64url'));
  } catch { return { valid: false, reason: 'malformed' }; }
  if (header.alg !== 'HS256') return { valid: false, reason: 'bad_alg' };
  const expected = Buffer.from(sign(`${h}.${p}`, key));
  const given = Buffer.from(s);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: 'bad_signature' };
  const t = Math.floor(now / 1000);
  if (claims.iat > t + CLOCK_SKEW_SECONDS) return { valid: false, reason: 'not_yet_valid' };
  if (claims.exp <= t - CLOCK_SKEW_SECONDS) return { valid: false, reason: 'expired' };
  if (revoked.has(claims.jti)) return { valid: false, reason: 'revoked' };
  return { valid: true, claims };
}
