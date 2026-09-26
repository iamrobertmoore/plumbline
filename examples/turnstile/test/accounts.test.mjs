import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccounts } from '../src/accounts.mjs';
import { createVerifier } from '../src/verify.mjs';
import { createLoginService } from '../src/login.mjs';
import { makeClock } from './helpers.mjs';

function setup() {
  const users = new Map();
  const clock = makeClock();
  const verifier = createVerifier({ users, clock });
  const accounts = createAccounts({ users, verifier });
  return { users, verifier, accounts, clock };
}

test('TC-79 registering issues an email verification token', () => {
  const { accounts } = setup();
  assert.equal(typeof accounts.register('ada@example.com', 'harbour-lights-42').verifyToken, 'string');
});

test('TC-81 confirming the token marks the email as verified', () => {
  const { accounts, verifier, users } = setup();
  const { verifyToken } = accounts.register('ada@example.com', 'harbour-lights-42');
  verifier.confirm(verifyToken);
  assert.equal(users.get('ada@example.com').emailVerified, true);
});

test('a verification link cannot be used twice', () => {
  const { accounts, verifier } = setup();
  const { verifyToken } = accounts.register('ada@example.com', 'harbour-lights-42');
  assert.equal(verifier.confirm(verifyToken).ok, true);
  assert.deepEqual(verifier.confirm(verifyToken), { ok: false, reason: 'invalid' });
});

test('TC-84 a deleted account cannot log in', () => {
  const { accounts, verifier, users, clock } = setup();
  const { verifyToken } = accounts.register('ada@example.com', 'harbour-lights-42');
  verifier.confirm(verifyToken);
  accounts.remove('ada@example.com');
  const login = createLoginService({ users, clock });
  assert.equal(login.login('ada@example.com', 'harbour-lights-42').ok, false);
});

test('TC-85 registering an email that already exists is refused', () => {
  const { accounts } = setup();
  accounts.register('ada@example.com', 'harbour-lights-42');
  assert.deepEqual(accounts.register('ADA@example.com', 'other-harbour-9'), { ok: false, reason: 'exists' });
});
