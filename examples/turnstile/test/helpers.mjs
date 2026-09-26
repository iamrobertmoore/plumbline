import { hashPassword } from '../src/passwords.mjs';

export const GOOD = 'harbour-lights-42';

// One hash, computed once. scrypt is deliberately slow and the suite does not need a fresh one per test.
const HASH = hashPassword(GOOD);

export function makeUsers(extra = {}) {
  return new Map([
    ['ada@example.com', { email: 'ada@example.com', passwordHash: HASH, emailVerified: true, roles: ['user'], ...extra }],
  ]);
}

export function makeClock(start = Date.UTC(2026, 8, 1, 9, 0, 0)) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => { t += ms; };
  return clock;
}

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
