import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRepo, isPrivateAddress, publicUrl, createLimiter } from '../api/_guard.mjs';

test('parseRepo accepts the three ways people write a repository', () => {
  assert.equal(parseRepo('ruvnet/RuView'), 'ruvnet/RuView');
  assert.equal(parseRepo('github.com/ruvnet/RuView'), 'ruvnet/RuView');
  assert.equal(parseRepo('https://github.com/ruvnet/RuView.git'), 'ruvnet/RuView');
  assert.equal(parseRepo('https://github.com/ruvnet/RuView/blob/main/README.md'), 'ruvnet/RuView');
});

test('parseRepo refuses anything that is not plainly a repository', () => {
  for (const bad of ['', 'nope', '../etc/passwd', 'https://evil.example/a/b', 'a/..', 'owner/repo name', '-bad/x']) {
    assert.equal(parseRepo(bad), null, bad);
  }
});

test('private, loopback and link-local addresses are recognised', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '140.82.112.3', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('publicUrl refuses local targets, including a public name that resolves privately', async () => {
  const fake = async (host) => (host === 'sneaky.example' ? [{ address: '10.1.2.3' }] : [{ address: '93.184.216.34' }]);
  assert.equal(await publicUrl('http://localhost:8000', fake), false);
  assert.equal(await publicUrl('http://169.254.169.254/latest/meta-data', fake), false);
  assert.equal(await publicUrl('https://sneaky.example/x', fake), false);
  assert.equal(await publicUrl('ftp://example.com/x', fake), false);
  assert.equal(await publicUrl('https://example.com/x', fake), true);
});

test('the limiter stops a loop and lets it go after the window', () => {
  let t = 0;
  const lim = createLimiter({ limit: 2, windowMs: 1000, clock: () => t });
  assert.equal(lim('a').ok, true);
  assert.equal(lim('a').ok, true);
  assert.equal(lim('a').ok, false);
  assert.equal(lim('b').ok, true);
  t = 1001;
  assert.equal(lim('a').ok, true);
});

test('the hosted checker and the measurement run the same code', () => {
  const api = readFileSync(new URL('../api/audit.js', import.meta.url), 'utf8');
  const harness = readFileSync(new URL('../measure/audit.mjs', import.meta.url), 'utf8');
  assert.match(api, /from '\.\.\/measure\/remote\.mjs'/);
  assert.match(harness, /from '\.\/remote\.mjs'/);
  assert.doesNotMatch(harness, /async function auditRepo/);
});
