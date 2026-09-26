import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, normaliseEmail, validatePassword, validateUsername } from '../src/validation.mjs';

test('TC-01 rejects an email address with no @', () => {
  assert.equal(validateEmail('ada.example.com'), false);
});

test('TC-02 rejects an email address whose domain has no dot', () => {
  assert.equal(validateEmail('ada@localhost'), false);
});

test('email addresses are trimmed and lowercased before use', () => {
  assert.equal(normaliseEmail('  Ada@Example.COM '), 'ada@example.com');
});

test('TC-05 rejects a password below the minimum length', () => {
  assert.ok(validatePassword('short1').includes('too_short'));
});

test('TC-06 rejects a password over 128 characters', () => {
  assert.ok(validatePassword('a1'.repeat(65)).includes('too_long'));
});

test('a password with no digit is refused', () => {
  assert.ok(validatePassword('harbour-lights').includes('no_digit'));
});

test('TC-08 rejects a password containing the local part of the email', () => {
  assert.ok(validatePassword('ada-lovelace-1815', { email: 'lovelace@example.com' }).includes('contains_email'));
});

test('TC-09 rejects a password on the common-password list', () => {
  assert.ok(validatePassword('Password1234').includes('common'));
});

test('TC-10 accepts a password that meets every rule', () => {
  assert.deepEqual(validatePassword('harbour-lights-42', { email: 'ada@example.com' }), []);
});

test('usernames may only use lowercase letters, digits and underscores', () => {
  assert.equal(validateUsername('ada_1815'), true);
  assert.equal(validateUsername('Ada.Lovelace'), false);
});
