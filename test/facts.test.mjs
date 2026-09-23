import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../facts/render.mjs';

// The entry checks other people's READMEs for claims that are not true. This is the
// same check pointed at its own surfaces: every figure agrees with facts/facts.json.
test('every surface states the same figures as facts/facts.json', () => {
  assert.deepEqual(run().problems, []);
});
