import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResetService } from '../src/reset.mjs';
import { verifyPassword } from '../src/passwords.mjs';
import { makeUsers, makeClock, MIN } from './helpers.mjs';

test('TC-61 a reset link is issued for a known email', () => {
  const svc = createResetService({ users: makeUsers(), clock: makeClock() });
  assert.equal(typeof svc.request('ada@example.com').token, 'string');
});

test('TC-62 an unknown email gets the same answer as a known one', () => {
  const svc = createResetService({ users: makeUsers(), clock: makeClock() });
  assert.deepEqual(svc.request('nobody@example.com'), { sent: true });
  assert.equal(svc.request('ada@example.com').sent, true);
});

test('TC-63 a reset link expires after one hour', () => {
  const clock = makeClock();
  const svc = createResetService({ users: makeUsers(), clock });
  const { token } = svc.request('ada@example.com');
  clock.advance(61 * MIN);
  assert.deepEqual(svc.complete(token, 'new-harbour-lights-7'), { ok: false, reason: 'expired' });
});

test('TC-64 a reset link works once', () => {
  const users = makeUsers();
  const svc = createResetService({ users, clock: makeClock() });
  const { token } = svc.request('ada@example.com');
  assert.equal(svc.complete(token, 'new-harbour-lights-7').ok, true);
  assert.equal(svc.complete(token, 'other-harbour-lights-8').ok, false);
  assert.equal(verifyPassword('new-harbour-lights-7', users.get('ada@example.com').passwordHash), true);
});

test('the new password must meet the password rules', () => {
  const svc = createResetService({ users: makeUsers(), clock: makeClock() });
  const { token } = svc.request('ada@example.com');
  assert.equal(svc.complete(token, 'short').reason, 'weak_password');
});
