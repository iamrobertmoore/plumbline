// The auditor and its verdict. Fixtures are real temporary directories, because
// the checks touch the filesystem and a mocked filesystem would not catch the
// class of bug that matters (a path that resolves somewhere unexpected).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit, CHECKS, SEVERITY, climbsAboveRoot } from '../src/plumbline.mjs';
import { renderJson, renderMarkdown } from '../src/report.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  }
  return root;
}

const cleanup = (root) => rmSync(root, { recursive: true, force: true });

test('a repository that does what it says passes', async () => {
  const root = fixture({
    'README.md': '# Fixture\n\n[guide](docs/guide.md)\n\nLicence: MIT\n',
    'docs/guide.md': '# Guide\n',
    'LICENSE': 'MIT\n',
    '.github/workflows/ci.yml': 'on: push\njobs:\n  a:\n    steps:\n      - run: echo hi\n',
  });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
    assert.equal(a.verdict, 'PASS');
  } finally { cleanup(root); }
});

test('a link to a file that does not exist is a failure, and says which file', async () => {
  const root = fixture({ 'README.md': '[missing](docs/nope.md)\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 1);
    assert.equal(a.results[0].check, 'link.relative');
    assert.match(a.results[0].detail, /docs\/nope\.md/);
    assert.equal(a.verdict, 'WARN');
  } finally { cleanup(root); }
});

test('a root-relative link is resolved against the repository, not the filesystem', async () => {
  // Regression: /docs/guide.md used to be reported as escaping the repository.
  const root = fixture({ 'README.md': '[guide](/docs/guide.md)\n', 'docs/guide.md': '# Guide\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
  } finally { cleanup(root); }
});

test('the verdict is never PASS while failures are listed', async () => {
  // The invariant that matters most. A report that says PASS and then lists three
  // broken things is the exact untruth this tool exists to catch.
  const fixtures = [
    { 'README.md': '[a](missing.md)\n' },
    { 'README.md': 'Licence: MIT\n' },
    { 'README.md': '[a](missing.md)\nLicence: MIT\n' },
    { 'README.md': '[a](missing.md)\n[b](gone.md)\nLicence: MIT\n' },
  ];
  for (const files of fixtures) {
    const root = fixture(files);
    try {
      const a = await audit({ root });
      if (a.failures > 0) assert.notEqual(a.verdict, 'PASS', JSON.stringify(a.results));
      else assert.equal(a.verdict, 'PASS');
    } finally { cleanup(root); }
  }
});

test('a licence claim is not an accusation when the About panel is not observable', async () => {
  // Without a GitHub context we cannot see whether the licence is detected.
  // Saying nothing is correct; inventing a fault is not.
  const root = fixture({ 'README.md': 'Licence: MIT\n', 'LICENSE': 'MIT\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
  } finally { cleanup(root); }
});

test('a licence claim with a file GitHub cannot detect is reported when it is observable', async () => {
  const root = fixture({ 'README.md': 'Licence: MIT\n', 'LICENSE': 'MIT\n' });
  try {
    const a = await audit({ root, githubLicense: null });
    assert.equal(a.failures, 1);
    assert.match(a.results[0].detail, /does not detect/);
  } finally { cleanup(root); }
});

test('CI claimed with no workflow directory is a failure', async () => {
  const root = fixture({ 'README.md': 'CI runs on every push.\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.results[0].check, 'ci.claimed');
    assert.equal(a.failures, 1);
  } finally { cleanup(root); }
});

test('a path that climbs above the repository root is not observable, not a fault', async () => {
  // "../../releases" from a root README is the standard way to link to a GitHub
  // repository's own releases page, and it resolves there correctly. The file tree
  // cannot answer the question, so the claim is counted as not observable rather
  // than accused. It used to be reported as "escapes the repository", which was an
  // accusation the evidence could not support.
  const root = fixture({ 'README.md': '[Releases](../../releases)\n[x](../../../etc/passwd)\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
    assert.equal(a.skipped, 2);
    for (const s of a.skippedDetail) assert.match(s.detail, /climbs above the repository root/);
  } finally { cleanup(root); }
});

test('climbsAboveRoot fires only when a path actually leaves the root', () => {
  // This rule is shared with the measurement harness on purpose. When it lived in
  // two places, the two copies disagreed and the published figure drifted.
  assert.equal(climbsAboveRoot('../../releases'), true);
  assert.equal(climbsAboveRoot('../x'), true);
  assert.equal(climbsAboveRoot('..'), true);
  assert.equal(climbsAboveRoot('docs/../README.md'), false);
  assert.equal(climbsAboveRoot('a/../../b'), true);
  assert.equal(climbsAboveRoot('./docs/guide.md'), false);
  assert.equal(climbsAboveRoot('docs/guide.md'), false);
  assert.equal(climbsAboveRoot(''), false);
});

test('the same claim is not reported twice', async () => {
  const root = fixture({ 'README.md': '[a](missing.md)\n[a](missing.md)\n' });
  try {
    const a = await audit({ root });
    assert.equal(a.failures, 1, JSON.stringify(a.results, null, 2));
  } finally { cleanup(root); }
});

test('results are ranked by severity, not by the order they ran', async () => {
  const root = fixture({ 'README.md': '[a](missing.md)\n' });
  try {
    const a = await audit({ root, githubLicense: null });
    const sev = a.results.map((r) => r.severity);
    assert.deepEqual(sev, [...sev].sort((x, y) => y - x));
  } finally { cleanup(root); }
});

test('the json report is parseable and carries the verdict', async () => {
  const root = fixture({ 'README.md': '[a](missing.md)\n' });
  try {
    const a = await audit({ root });
    const j = JSON.parse(renderJson(a, null));
    assert.equal(j.verdict, 'WARN');
    assert.equal(j.failures, 1);
    assert.ok(Array.isArray(j.results));
  } finally { cleanup(root); }
});

test('the markdown report states the verdict and names the failing claim', async () => {
  const root = fixture({ 'README.md': '[a](missing.md)\n' });
  try {
    const a = await audit({ root });
    const md = renderMarkdown(a, null);
    assert.match(md, /WARN/);
    assert.match(md, /missing\.md/);
  } finally { cleanup(root); }
});

test('every registered check declares how to break itself', () => {
  // The negative controls are the product. A check without one is a liability.
  for (const [id, check] of Object.entries(CHECKS)) {
    const hasControl = typeof check.mutate === 'function' || typeof check.mutateCtx === 'function';
    assert.ok(hasControl, `${id} has no negative control`);
    assert.equal(typeof check.run, 'function', `${id} has no run`);
    assert.ok(check.severity >= SEVERITY.NOTE, `${id} has no severity`);
  }
});
