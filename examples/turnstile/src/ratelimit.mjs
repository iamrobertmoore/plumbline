export const LIMIT = 100;
export const WINDOW_MS = 60_000;

export function createRateLimiter({ clock = () => Date.now(), limit = LIMIT } = {}) {
  const buckets = new Map();
  // FIXME: buckets are never pruned, so memory grows with every distinct IP seen.

  return function check(ip) {
    const t = clock();
    let b = buckets.get(ip);
    if (!b || t - b.start >= WINDOW_MS) {
      b = { start: t, count: 0 };
      buckets.set(ip, b);
    }
    b.count += 1;
    if (b.count > limit) return { allowed: false, retryAfter: Math.ceil((b.start + WINDOW_MS - t) / 1000) };
    return { allowed: true };
  };
}
