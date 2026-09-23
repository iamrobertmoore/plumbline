// Which check answers which claim, and what happens to a claim nothing answers.
//
// This file exists because of a defect that no other test could have caught. The
// dispatch in `audit()` used to look a claim's check up directly by the claim's id, and
// to `continue` when it found nothing. Two of the ids the parsers emit are external
// links (`link.bare`, `manifest.homepage`) and neither had a check registered under its
// own name, so the tool dropped them in silence.
//
// The measurement harness did not drop them, because it selects on `kind === 'link'`
// rather than on the id. So the published number counted findings the published tool did
// not report, which is the same defect correction 5 in docs/MEASUREMENT.md was written
// about, recurring in a place nobody had looked.
//
// The first test below is the important one. It fails if a new claim type is added to a
// parser without somebody deciding which check answers it, or that nothing does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import {
  CHECK_FOR, UNCHECKED, CHECKS, claimsFromReadme, claimsFromManifest, audit,
} from '../src/plumbline.mjs';

// A README and a manifest built to trip every branch of both parsers, so the set of ids
// they emit is the set of ids they can emit. If a parser gains a branch, this fixture
// has to gain a line, and the first test then fails until the map is updated too.
const FIXTURE_README = [
  '# fixture',
  '',
  'An external [link](https://example.com/docs) and a [relative](docs/other.md) one.',
  '',
  'A bare URL in prose: https://example.com/bare',
  '',
  'Install it with npm install left-pad.',
  '',
  // "licence" has to be a whole word: the parser matches /\blicen[cs]e\b/i, so
  // "licensed" does not trip it and this line has to say "licence" to reach that branch.
  'Version 1.2.3 is the current one. CI runs on every push. Released under the MIT licence.',
  '',
].join('\n');

const FIXTURE_MANIFEST = JSON.stringify({
  name: 'fixture-package',
  version: '1.2.3',
  license: 'MIT',
  homepage: 'https://example.com/',
}, null, 2);

function withTempRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'plumbline-mapping-'));
  writeFileSync(join(dir, 'README.md'), FIXTURE_README);
  writeFileSync(join(dir, 'package.json'), FIXTURE_MANIFEST);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function emittedIds() {
  const readme = claimsFromReadme(FIXTURE_README).map((c) => c.id);
  const dir = mkdtempSync(join(tmpdir(), 'plumbline-ids-'));
  try {
    writeFileSync(join(dir, 'package.json'), FIXTURE_MANIFEST);
    return new Set([...readme, ...claimsFromManifest(join(dir, 'package.json')).map((c) => c.id)]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('every claim id a parser can emit is either mapped to a check or named as unchecked', () => {
  const emitted = emittedIds();
  const accounted = new Set([...Object.keys(CHECK_FOR), ...Object.keys(UNCHECKED)]);

  const unaccounted = [...emitted].filter((id) => !accounted.has(id));
  assert.deepEqual(
    unaccounted, [],
    `these claim ids are emitted by a parser and nothing decides what happens to them, `
    + `so audit() would report them as "not checked" or drop them: ${unaccounted.join(', ')}`,
  );

  // The other direction. An entry in either map that no parser can produce is dead
  // configuration, and dead configuration is how a map stops describing the code.
  const dead = [...accounted].filter((id) => !emitted.has(id));
  assert.deepEqual(
    dead, [],
    `these ids are mapped but no parser in the fixture emits them, so either the fixture `
    + `is incomplete or the map has a stale entry: ${dead.join(', ')}`,
  );
});

test('every mapped claim id points at a check that exists', () => {
  for (const [id, target] of Object.entries(CHECK_FOR)) {
    assert.ok(
      Object.hasOwn(CHECKS, target),
      `claim id "${id}" is mapped to check "${target}", which is not in CHECKS`,
    );
  }
});

test('no claim id is both mapped and unchecked', () => {
  const both = Object.keys(CHECK_FOR).filter((id) => Object.hasOwn(UNCHECKED, id));
  assert.deepEqual(both, [], `these ids are in both maps, so which one wins is accidental: ${both.join(', ')}`);
});

test('a bare URL and a manifest homepage are answered by the external-link check', () => {
  // The two ids the tool used to drop, asserted individually rather than in aggregate,
  // so a future edit to the map has to break this test on purpose.
  assert.equal(CHECK_FOR['link.bare'], 'link.external');
  assert.equal(CHECK_FOR['manifest.homepage'], 'link.external');
});

test('the parser reads a bare URL and a manifest homepage at all', () => {
  // The map above is only worth anything if the claims reach it. Both of these were
  // reaching the harness and not the tool.
  const ids = emittedIds();
  assert.ok(ids.has('link.bare'), 'the parser did not emit a link.bare claim for a bare URL in prose');
  assert.ok(ids.has('manifest.homepage'), 'the parser did not emit a manifest.homepage claim');
});

test('a dead bare URL in a README is reported, not dropped', async () => {
  // End to end, offline, against a server that answers 404 on both HEAD and GET. This
  // is the regression the whole file is for: before the fix, this repository was
  // audited, the bare URL produced a claim, and the claim vanished.
  const srv = createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dead = `http://127.0.0.1:${srv.address().port}/gone`;
  const dir = mkdtempSync(join(tmpdir(), 'plumbline-bare-'));
  try {
    writeFileSync(join(dir, 'README.md'), `# fixture\n\nSee ${dead} for the docs.\n`);
    const a = await audit({ root: dir });

    const bare = a.results.find((r) => r.check === 'link.bare');
    assert.ok(bare, 'the bare URL produced no result at all, so it was dropped again');
    assert.equal(bare.ok, false, `expected the 404 to be reported, got: ${bare.detail}`);
    assert.match(bare.detail, /^404 /);

    // And it is not sitting in the unchecked list, which would be the same defect with
    // a friendlier name.
    assert.equal(
      (a.uncheckedDetail || []).some((u) => u.check === 'link.bare'), false,
      'a bare URL is being reported as not checked rather than as checked',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await new Promise((r) => srv.close(r));
  }
});

test('a dead manifest homepage is reported, not dropped', async () => {
  // The other half of the same defect, and it needs its own test because the two ids
  // reach the dispatch by different routes: `link.bare` comes from the README parser
  // and `manifest.homepage` from the manifest parser. Fixing one does not fix the
  // other, and a map entry is not evidence that the route works.
  const srv = createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dead = `http://127.0.0.1:${srv.address().port}/gone`;
  const dir = mkdtempSync(join(tmpdir(), 'plumbline-homepage-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'fixture-package', version: '1.2.3', license: 'MIT', homepage: dead,
    }, null, 2));
    const a = await audit({ root: dir });

    const home = a.results.find((r) => r.check === 'manifest.homepage');
    assert.ok(home, 'the manifest homepage produced no result at all, so it was dropped again');
    assert.equal(home.ok, false, `expected the 404 to be reported, got: ${home.detail}`);
    assert.match(home.detail, /^404 /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await new Promise((r) => srv.close(r));
  }
});

test('a claim nothing answers is named in the report rather than dropped', async () => {
  // The second half of the fix. A claim type that is deliberately unchecked has to be
  // visible, because "not checked" and "held" are different statements.
  await withTempRepo(async (dir) => {
    const a = await audit({ root: dir });
    const ids = (a.uncheckedDetail || []).map((u) => u.check);
    assert.ok(ids.includes('version'), `expected the bare version number to be named as unchecked, got: ${ids.join(', ')}`);
    for (const u of a.uncheckedDetail) {
      assert.ok(u.detail && u.detail.length > 10, `unchecked claim "${u.check}" carries no reason`);
    }
    assert.equal(a.unchecked, a.uncheckedDetail.length);
  });
});

test('claims read equals the claims that were checked, skipped or named as unchecked', async () => {
  // The arithmetic that would have caught the original defect on any real repository.
  // A claim that is read and then neither checked, skipped nor named has disappeared.
  await withTempRepo(async (dir) => {
    const a = await audit({ root: dir });
    assert.equal(
      a.claims, a.checked + a.skipped + a.unchecked,
      `claims read (${a.claims}) does not equal checked (${a.checked}) + skipped (${a.skipped}) `
      + `+ unchecked (${a.unchecked}), so ${a.claims - a.checked - a.skipped - a.unchecked} claim(s) went missing`,
    );
  });
});
