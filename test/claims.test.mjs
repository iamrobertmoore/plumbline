// Claim extraction. Pure functions, no network.
//
// These tests exist because claim extraction is where the false positives came
// from. Every case below is one that produced a wrong finding at least once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimsFromReadme, proseOnly } from '../src/plumbline.mjs';

const ids = (md) => claimsFromReadme(md).map((c) => c.id);
const paths = (md) => claimsFromReadme(md).filter((c) => c.id === 'link.relative').map((c) => c.path);
const urls = (md) => claimsFromReadme(md).filter((c) => c.id === 'link.external').map((c) => c.url);
// Bare prose URLs carry their own id, so anything asserting on URL parsing as a
// whole has to look at both passes.
const allUrls = (md) => claimsFromReadme(md).filter((c) => c.kind === 'link').map((c) => c.url);

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

test('a query string is stripped from a path claim', () => {
  // Regression: "?WT.mc_id=..." stayed on the end of the path, so a link to a file
  // that exists was reported as pointing at nothing. Marketing parameters on
  // relative links are everywhere, which made this the most productive false
  // accusation the tool had.
  assert.deepEqual(paths('[x](images/x.png?WT.mc_id=abc123)'), ['images/x.png']);
  assert.deepEqual(paths('[x](./docs/guide.md?plain=1#install)'), ['./docs/guide.md']);
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

test('a genuine traversal is still extracted, so it can be reported', () => {
  // This one MUST survive extraction. Dropping it at parse time would hide the path
  // entirely; the check is where the decision belongs, and it reports a path that
  // climbs out of the repository as not observable rather than as a fault.
  assert.deepEqual(paths('[x](../../etc/passwd)'), ['../../etc/passwd']);
});

test('a link destination containing balanced parentheses survives intact', () => {
  // Regression: the destination was cut at the first ")", so a live Wikipedia page
  // was reported as dead. A false accusation is the one finding this tool must
  // never produce, so this case is pinned.
  assert.deepEqual(paths('[x](docs/a_(b).md)'), ['docs/a_(b).md']);
  assert.deepEqual(urls('[x](https://en.wikipedia.org/wiki/Script_(Unix))'),
    ['https://en.wikipedia.org/wiki/Script_(Unix)']);
});

test('a bare URL containing balanced parentheses is not cut short', () => {
  assert.deepEqual(allUrls('see https://en.wikipedia.org/wiki/Script_(Unix) for detail'),
    ['https://en.wikipedia.org/wiki/Script_(Unix)']);
});

test('an unmatched closing parenthesis ends the link rather than joining it', () => {
  // "(see https://example.com/foo)" is a sentence, not a URL with a trailing paren.
  assert.deepEqual(allUrls('(see https://example.com/foo)'), ['https://example.com/foo']);
});

test('the markdown and bare passes agree, so one URL stays one claim', () => {
  const c = claimsFromReadme('[x](https://example.com/a_(b))');
  assert.deepEqual([...new Set(c.map((x) => x.url).filter(Boolean))], ['https://example.com/a_(b)']);
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

test('an install command does not reach across a line break', () => {
  // Regression: "    npm install" alone on a line, followed by prose beginning
  // "There are...", produced a claim that the project installs a package called
  // "There". A shell command does not span a line, and an npm name is lowercase.
  const c = claimsFromReadme('    npm install\n\nThere are slow tests and fast tests.\n');
  assert.deepEqual(c.filter((x) => x.id === 'install'), []);
});

test('a licence mention and a CI mention are both detected', () => {
  assert.ok(ids('Licence: MIT').includes('license.claimed'));
  assert.ok(ids('CI runs on every push').includes('ci.claimed'));
  assert.ok(!ids('nothing to see').includes('ci.claimed'));
});

test('a link inside an inline code span is not a link', () => {
  // Regression, and the worst kind: a false accusation of a broken link. Graphify's
  // README documents its own parser with `[text](./other.md)` in backticks. The file
  // has never existed, because it was never meant to. The tool reported the project
  // for linking a file it had not written, which is exactly the thing this tool
  // exists to argue against.
  const md = 'Docs | markdown `[text](./other.md)` links become edges';
  assert.deepEqual(paths(md), []);
});

test('a link inside a fenced block is not a link', () => {
  const md = 'Intro.\n\n```md\n[guide](docs/guide.md)\n```\n\nDone.\n';
  assert.deepEqual(paths(md), []);
});

test('a bare URL inside a fenced block is not a link', () => {
  const md = 'Example:\n\n```bash\ncurl https://example.invalid/nowhere\n```\n';
  assert.deepEqual(allUrls(md), []);
});

test('stripping code does not remove the real links around it', () => {
  // The control for the three tests above. If the stripper were too greedy it would
  // delete the genuine links too, and every one of those tests would still pass while
  // the tool silently stopped checking anything.
  const md = 'See `[x](./fake.md)` in the docs.\n\nReal: [guide](docs/guide.md)\n';
  assert.deepEqual(paths(md), ['docs/guide.md']);
});

test('stripping code leaves the line structure and the length alone', () => {
  // Two URLs that were never adjacent must not become adjacent, or the bare-URL pass
  // invents a link that spans them.
  const md = 'a\n```\nzzz\n```\nb https://example.com/x\n';
  assert.deepEqual(allUrls(md), ['https://example.com/x']);
  assert.equal(proseOnly(md).split('\n').length, md.split('\n').length);
  assert.equal(proseOnly(md).length, md.length);
});

test('an unclosed fence does not silently swallow the rest of the file', () => {
  // Deliberately not asserting a specific outcome, because either is defensible.
  // What must not happen is a crash or a claim invented from the fence marker.
  const md = '```\nunclosed\n\n[real](docs/guide.md)\n';
  assert.doesNotThrow(() => claimsFromReadme(md));
});
