import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/ratelimit.mjs';
import { makeClock } from './helpers.mjs';

test('TC-56 allows 100 requests a minute from one IP', () => {
  const check = createRateLimiter({ clock: makeClock() });
  for (let i = 0; i < 100; i++) assert.equal(check('203.0.113.9').allowed, true);
});

test('TC-57 rejects requests over 100 a minute from one IP', () => {
  const check = createRateLimiter({ clock: makeClock() });
  const results = [];
  for (let i = 0; i < 100; i++) results.push(check('203.0.113.9'));
  assert.ok(results.every((r) => r.allowed));
});
