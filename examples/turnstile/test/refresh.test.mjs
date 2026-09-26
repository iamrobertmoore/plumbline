import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshStore } from '../src/refresh.mjs';
import { verifyAccess } from '../src/tokens.mjs';
import { makeUsers, makeClock, DAY } from './helpers.mjs';

test('TC-42 refreshing returns a new access token and a new refresh token', () => {
  const clock = makeClock();
  const store = createRefreshStore({ users: makeUsers(), clock });
  const r1 = store.issue('ada@example.com');
  const out = store.refresh(r1);
  assert.equal(out.ok, true);
  assert.notEqual(out.refresh, r1);
  assert.equal(verifyAccess(out.access, { now: clock() }).valid, true);
});

test('refresh tokens rotate on use', () => {
  const store = createRefreshStore({ users: makeUsers(), clock: makeClock() });
  const r1 = store.issue('ada@example.com');
  const out = store.refresh(r1);
  assert.equal(out.ok, true);
  assert.notEqual(out.refresh, r1);
  assert.equal(typeof out.refresh, 'string');
});

test('TC-45 a refresh token expires after thirty days', () => {
  const clock = makeClock();
  const store = createRefreshStore({ users: makeUsers(), clock });
  const r1 = store.issue('ada@example.com');
  clock.advance(30 * DAY + 1);
  assert.deepEqual(store.refresh(r1), { ok: false, reason: 'expired' });
});

test('TC-46 a refresh token for a deleted user is rejected', () => {
  const users = makeUsers();
  const store = createRefreshStore({ users, clock: makeClock() });
  const r1 = store.issue('ada@example.com');
  users.delete('ada@example.com');
  assert.deepEqual(store.refresh(r1), { ok: false, reason: 'no_user' });
});
