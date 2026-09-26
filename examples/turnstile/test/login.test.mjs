import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginService } from '../src/login.mjs';
import { createAuditLog } from '../src/audit.mjs';
import { makeUsers, makeClock, GOOD, MIN } from './helpers.mjs';

function setup(extra) {
  const clock = makeClock();
  const log = createAuditLog({ clock });
  const svc = createLoginService({ users: makeUsers(extra), clock, audit: log.record });
  return { clock, log, svc };
}

test('TC-20 a correct email and password logs in', () => {
  const { svc } = setup();
  assert.equal(svc.login('ada@example.com', GOOD).ok, true);
});

test('TC-21 a wrong password is refused as invalid credentials', () => {
  const { svc } = setup();
  assert.deepEqual(svc.login('ada@example.com', 'nope-nope-1'), { ok: false, reason: 'invalid_credentials' });
});

test('TC-22 the account locks after five failed attempts', () => {
  const { svc } = setup();
  for (let i = 0; i < 4; i++) svc.login('ada@example.com', 'nope-nope-1');
  assert.equal(svc.isLocked('ada@example.com'), false);
  svc.login('ada@example.com', 'nope-nope-1');
  assert.equal(svc.isLocked('ada@example.com'), true);
});

test('a locked account refuses even the right password', () => {
  const { svc } = setup();
  for (let i = 0; i < 5; i++) svc.login('ada@example.com', 'nope-nope-1');
  assert.deepEqual(svc.login('ada@example.com', GOOD), { ok: false, reason: 'locked' });
});

test('TC-24 the lock lifts after fifteen minutes', () => {
  const { svc, clock } = setup();
  for (let i = 0; i < 5; i++) svc.login('ada@example.com', 'nope-nope-1');
  clock.advance(14 * MIN);
  assert.equal(svc.isLocked('ada@example.com'), true);
  clock.advance(2 * MIN);
  assert.equal(svc.login('ada@example.com', GOOD).ok, true);
});

test('TC-25 a successful login resets the failure count', () => {
  const { svc } = setup();
  for (let i = 0; i < 4; i++) svc.login('ada@example.com', 'nope-nope-1');
  svc.login('ada@example.com', GOOD);
  for (let i = 0; i < 4; i++) svc.login('ada@example.com', 'nope-nope-1');
  assert.equal(svc.isLocked('ada@example.com'), false);
});

test('unknown email and wrong password look identical to the caller', () => {
  const { svc } = setup();
  assert.deepEqual(svc.login('nobody@example.com', GOOD), svc.login('ada@example.com', 'nope-nope-1'));
});

test('TC-27 an account with an unverified email cannot log in', () => {
  const { svc } = setup({ emailVerified: false });
  assert.deepEqual(svc.login('ada@example.com', GOOD), { ok: false, reason: 'unverified' });
});

test('TC-68 a failed login is written to the audit log with the client IP', () => {
  const { svc, log } = setup();
  svc.login('ada@example.com', 'nope-nope-1', { ip: '203.0.113.9' });
  assert.ok(log.entries.some((e) => e.type === 'login.failed' && e.ip === '203.0.113.9'));
});

test('TC-69 a successful login is written to the audit log', () => {
  const { svc, log } = setup();
  svc.login('ada@example.com', GOOD);
  assert.ok(log.entries.some((e) => e.type === 'login.succeeded'));
});

test('TC-70 a lockout is written to the audit log', () => {
  const { svc, log } = setup();
  for (let i = 0; i < 5; i++) svc.login('ada@example.com', 'nope-nope-1');
  assert.ok(log.entries.some((e) => e.type === 'account.locked'));
});
