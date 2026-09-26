import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/sessions.mjs';
import { makeClock, MIN } from './helpers.mjs';

test('TC-48 logging in creates a session', () => {
  const s = createSessionStore({ clock: makeClock() });
  assert.ok(s.get(s.create('ada@example.com')));
});

test('TC-49 a session ends after thirty minutes idle', () => {
  const clock = makeClock();
  const s = createSessionStore({ clock });
  const id = s.create('ada@example.com');
  clock.advance(31 * MIN);
  assert.equal(s.get(id), null);
});

test('activity keeps a session alive', () => {
  const clock = makeClock();
  const s = createSessionStore({ clock });
  const id = s.create('ada@example.com');
  clock.advance(20 * MIN);
  s.get(id);
  clock.advance(20 * MIN);
  assert.ok(s.get(id));
});

test('TC-52 logging out ends the session', () => {
  const s = createSessionStore({ clock: makeClock() });
  const id = s.create('ada@example.com');
  s.destroy(id);
  assert.equal(s.get(id), null);
});

test('TC-54 session ids are 32 random bytes', () => {
  const s = createSessionStore({ clock: makeClock() });
  assert.match(s.create('ada@example.com'), /^[0-9a-f]{64}$/);
});
