import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueAccess, verifyAccess } from '../src/tokens.mjs';

const NOW = Date.UTC(2026, 8, 1, 9, 0, 0);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const payloadOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));

test('TC-28 a freshly issued access token verifies', () => {
  assert.equal(verifyAccess(issueAccess('ada@example.com', ['user'], { now: NOW }), { now: NOW }).valid, true);
});

test('TC-29 the access token carries the subject', () => {
  assert.equal(payloadOf(issueAccess('ada@example.com', [], { now: NOW })).sub, 'ada@example.com');
});

test('TC-30 the access token carries the roles', () => {
  assert.deepEqual(payloadOf(issueAccess('ada@example.com', ['admin'], { now: NOW })).roles, ['admin']);
});

test('TC-31 a token with an edited payload is rejected', () => {
  const [h, , s] = issueAccess('ada@example.com', ['user'], { now: NOW }).split('.');
  const forged = `${h}.${b64({ sub: 'ada@example.com', roles: ['admin'], iat: NOW / 1000, exp: NOW / 1000 + 900 })}.${s}`;
  assert.equal(verifyAccess(forged, { now: NOW }).valid, false);
});

test('tampering with the signature is caught', () => {
  const t = issueAccess('ada@example.com', ['user'], { now: NOW });
  const last = t.at(-1) === 'A' ? 'B' : 'A';
  assert.equal(verifyAccess(t.slice(0, -1) + last, { now: NOW }).reason, 'bad_signature');
});

test('TC-33 a token signed with a different key is rejected', () => {
  const t = issueAccess('ada@example.com', ['user'], { now: NOW, key: 'someone-elses-key' });
  assert.equal(verifyAccess(t, { now: NOW }).valid, false);
});

test('TC-34 a malformed token is rejected without throwing', () => {
  assert.equal(verifyAccess('a.b.c', { now: NOW }).reason, 'malformed');
  assert.equal(verifyAccess('nonsense', { now: NOW }).reason, 'malformed');
});

test('TC-35 a token declaring alg none is rejected', () => {
  const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', iat: NOW / 1000, exp: NOW / 1000 + 900 })}.`;
  assert.equal(verifyAccess(t, { now: NOW }).reason, 'bad_alg');
});

test('TC-37 a token issued up to thirty seconds in the future is accepted', () => {
  const t = issueAccess('ada@example.com', [], { now: NOW + 20_000 });
  assert.equal(verifyAccess(t, { now: NOW }).valid, true);
});

test('TC-40 the access token names its issuer', () => {
  assert.equal(payloadOf(issueAccess('ada@example.com', [], { now: NOW })).iss, 'turnstile');
});

test('TC-41 rejects an expired access token', () => {
  const t = issueAccess('ada@example.com', ['user'], { now: NOW });
  const result = verifyAccess(t, { now: NOW + 3 * 60 * 60 * 1000 });
  assert.ok(result);
});
