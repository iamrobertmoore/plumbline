import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/passwords.mjs';

test('TC-13 a stored hash never contains the plaintext password', () => {
  const h = hashPassword('harbour-lights-42');
  assert.ok(!h.includes('harbour-lights-42'));
});

test('TC-14 hashing the same password twice gives different hashes', () => {
  assert.notEqual(hashPassword('harbour-lights-42'), hashPassword('harbour-lights-42'));
});

test('TC-15 verify accepts the correct password', () => {
  assert.equal(verifyPassword('harbour-lights-42', hashPassword('harbour-lights-42')), true);
});

test('verify says no to the wrong password', () => {
  assert.equal(verifyPassword('harbour-lights-43', hashPassword('harbour-lights-42')), false);
});

test('TC-19 verify returns false for a malformed stored hash instead of throwing', () => {
  assert.equal(verifyPassword('x', 'not-a-hash'), false);
  assert.equal(verifyPassword('x', 'scrypt$1$2'), false);
});

test('hash format is self-describing', () => {
  assert.match(hashPassword('harbour-lights-42'), /^scrypt\$\d+\$\d+\$\d+\$/);
});
