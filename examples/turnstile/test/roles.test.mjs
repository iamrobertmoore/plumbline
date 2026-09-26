import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can } from '../src/roles.mjs';

test('TC-74 an admin can manage users', () => {
  assert.equal(can({ roles: ['admin'] }, 'users:write'), true);
});

test('TC-75 an ordinary user cannot manage users', () => {
  assert.equal(can({ roles: ['user'] }, 'users:write'), false);
});
