// Claim extraction. Pure functions, no network.
//
// These tests exist because claim extraction is where the false positives came
// from. Every case below is one that produced a wrong finding at least once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimsFromReadme } from '../src/plumbline.mjs';

const ids = (md) => claimsFromReadme(md).map((c) => c.id);
const paths = (md) => claimsFromReadme(md).filter((c) => c.id === 'link.relative').map((c) => c.path);
const urls = (md) => claimsFromReadme(md).filter((c) => c.id === 'link.external').map((c) => c.url);

test('an ordinary relative link becomes a path claim', () => {
  assert.deepEqual(paths('[docs](docs/guide.md)'), ['docs/guide.md']);
});

test('a fragment is stripped from a path claim', () => {
  assert.deepEqual(paths('[docs](docs/guide.md#install)'), ['docs/guide.md']);
});

test('an http link becomes an external claim, not a path', () => {
  assert.deepEqual(paths('[site](https://example.com/x)'), []);
  assert.deepEqual(urls('[site](https://example.com/x)'), ['https://example.com/x']);
});

test('a leading slash is repository-root-relative, not absolute', () => {
  // Regression: this used to be reported as "escapes the repository".
  assert.deepEqual(paths('[docs](/docs/guide.md)'), ['docs/guide.md']);
});

test('a non-http URI scheme is not a path in this repository', () => {
  // Regression: irc: and friends used to be checked as filesystem paths.
  for (const href of ['irc://irc.libera.chat/x', 'mailto:a@b.c', 'tel:+441234567890', 'ftp://example.com/f']) {
    assert.deepEqual(paths(`[x](${href})`), [], `${href} should not be a path claim`);
    assert.deepEqual(urls(`[x](${href})`), [], `${href} should not be an external claim`);
  }
});

test('a bare fragment is not a path', () => {
  assert.deepEqual(paths('[top](#readme)'), []);
});

test('a protocol-relative URL is not a path', () => {
  assert.deepEqual(paths('[x](//cdn.example.com/a.png)'), []);
});

test('a pipe in a link destination is treated as a table artefact and skipped', () => {
  assert.deepEqual(paths('[x](a.md|b.md)'), []);
});

test('a genuine traversal is still extracted, so it can be caught', () => {
  // This one MUST survive extraction. Dropping it would hide a real escape.
  assert.deepEqual(paths('[x](../../etc/passwd)'), ['../../etc/passwd']);
});

test('an install command is extracted with its package name', () => {
  const c = claimsFromReadme('npm install left-pad').filter((x) => x.id === 'install');
  assert.equal(c.length, 1);
  assert.equal(c[0].pkg, 'left-pad');
});

test('scoped and flag-bearing install commands are extracted', () => {
  assert.equal(claimsFromReadme('npm i --save-dev @scope/pkg').find((x) => x.id === 'install')?.pkg, '@scope/pkg');
  assert.equal(claimsFromReadme('yarn add chalk').find((x) => x.id === 'install')?.pkg, 'chalk');
});

test('a licence mention and a CI mention are both detected', () => {
  assert.ok(ids('Licence: MIT').includes('license.claimed'));
  assert.ok(ids('CI runs on every push').includes('ci.claimed'));
  assert.ok(!ids('nothing to see').includes('ci.claimed'));
});
