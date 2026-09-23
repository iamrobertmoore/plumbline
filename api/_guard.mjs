// The rules the hosted checker applies before it does anything on a visitor's behalf.
// Kept apart from the handler so they can be tested without a network.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Accepts "owner/repo", "github.com/owner/repo" or a full https URL to a repository,
// and nothing else. Anything that is not plainly a public GitHub repository is refused
// rather than guessed at.
export function parseRepo(input) {
  const s = String(input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/);
  if (!m) return null;
  if (m[2] === '.' || m[2] === '..') return null;
  return `${m[1]}/${m[2]}`;
}

export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x === '::1' || x === '::') return true;
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x)) return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  return true;
}

// A README can link anywhere, including addresses inside the network this function runs
// in. The hosted checker will not fetch those for a stranger. A refused link is counted
// and reported as not tested; it is never read as a link that works.
export async function publicUrl(url, resolve = lookup) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addrs = await resolve(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    // A name that does not resolve is left to the check, which reports it as unreachable.
    return true;
  }
}

// Per-instance and deliberately simple. The CDN cache in front of the function does
// most of the work; this stops one visitor looping the button.
export function createLimiter({ limit = 6, windowMs = 5 * 60 * 1000, clock = () => Date.now() } = {}) {
  const seen = new Map();
  return (key) => {
    const t = clock();
    const hits = (seen.get(key) || []).filter((x) => t - x < windowMs);
    if (hits.length >= limit) { seen.set(key, hits); return { ok: false, retryAfter: Math.ceil((hits[0] + windowMs - t) / 1000) }; }
    hits.push(t);
    seen.set(key, hits);
    return { ok: true };
  };
}
