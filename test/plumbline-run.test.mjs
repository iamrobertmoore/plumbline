// test/plumbline-run.test.mjs
//
// Tests for plumbline-run.mjs helpers and one integration test that builds a
// real temporary git repository to verify CAUGHT vs NAME_ONLY.
//
// Zero external dependencies. Node >= 20, built-in test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Import helpers directly from the skill folder.
import {
  applyMutation,
  loadClaims,
  saveClaims,
  processRow,
} from '../.bob/skills/plumbline/plumbline-run.mjs';

import { renderReport } from '../.bob/skills/plumbline/render-report.mjs';

// ── helpers ────────────────────────────────────────────────────────────────

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'plumbline-test-'));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

// Build a minimal git repository in `root` with a source file and one test
// file. Returns { root, srcFile, testFile }.
function buildGitRepo(root, { srcContent, testContent }) {
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });

  const srcFile = 'src/add.mjs';
  const testFile = 'test/add.test.mjs';

  writeFileSync(join(root, srcFile), srcContent, 'utf8');
  writeFileSync(join(root, testFile), testContent, 'utf8');

  // Minimal git setup (no network, no config needed beyond user identity).
  function git(...args) {
    const r = spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }

  git('init', '-b', 'main');
  git('add', '.');
  git('commit', '-m', 'init');

  return { root, srcFile, testFile };
}

// ── unit: applyMutation ────────────────────────────────────────────────────

test('applyMutation replaces the search string exactly once', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'src.mjs');
    writeFileSync(file, 'export function add(a,b){return a+b;}\n', 'utf8');
    applyMutation(dir, { file: 'src.mjs', search: 'a+b', replace: 'a-b' });
    assert.equal(readFileSync(file, 'utf8'), 'export function add(a,b){return a-b;}\n');
  } finally { cleanup(dir); }
});

test('applyMutation throws when search string is not found', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'src.mjs');
    writeFileSync(file, 'export function add(a,b){return a+b;}\n', 'utf8');
    assert.throws(
      () => applyMutation(dir, { file: 'src.mjs', search: 'NOTHERE', replace: 'x' }),
      /MUTATION_INVALID/
    );
  } finally { cleanup(dir); }
});

test('applyMutation throws when search string appears more than once', () => {
  const dir = tmpDir();
  try {
    const file = join(dir, 'src.mjs');
    writeFileSync(file, 'a+b; a+b;\n', 'utf8');
    assert.throws(
      () => applyMutation(dir, { file: 'src.mjs', search: 'a+b', replace: 'x' }),
      /MUTATION_INVALID/
    );
  } finally { cleanup(dir); }
});

// ── unit: renderReport ─────────────────────────────────────────────────────

test('renderReport returns HTML containing a table and plumbline reference', () => {
  // Supply one test-plan claim so the coverage table is rendered.
  const claims = [{
    id: 'TP-001', source: 's', kind: 'test-plan', text: 'some claim',
    testFile: null, testName: null,
    mutation: null, verdict: null, verdictDetail: null, mutationResult: null,
  }];
  const html = renderReport(claims);
  assert.match(html, /<table/i);
  assert.match(html, /[Pp]lumbline/);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
});

test('renderReport marks NAME_ONLY rows with .bad class and label', () => {
  const claims = [{
    id: 'TP-001',
    source: 'test.xlsx!Sheet1!B2',
    kind: 'test-plan',
    text: 'add returns the sum',
    testFile: 'test/add.test.mjs',
    testName: 'add returns the sum',
    mutation: { file: 'src/add.mjs', search: 'a+b', replace: 'a-b' },
    verdict: null,
    verdictDetail: null,
    mutationResult: 'NAME_ONLY',
  }];
  const html = renderReport(claims);
  assert.match(html, /class="bad"/);
  assert.match(html, /TEST IN NAME ONLY/);
});

test('renderReport shows CAUGHT rows as .ok', () => {
  const claims = [{
    id: 'TP-002',
    source: 'test.xlsx!Sheet1!B3',
    kind: 'test-plan',
    text: 'add returns the sum',
    testFile: 'test/add.test.mjs',
    testName: 'add returns the sum',
    mutation: { file: 'src/add.mjs', search: 'a+b', replace: 'a-b' },
    verdict: null,
    verdictDetail: null,
    mutationResult: 'CAUGHT',
  }];
  const html = renderReport(claims);
  assert.match(html, /class="ok"/);
});

test('renderReport headline tiles show the correct counts', () => {
  const claims = [
    {
      id: 'TP-001', source: 's', kind: 'test-plan', text: 'a',
      testFile: 'test/t.mjs', testName: 'a',
      mutation: null, verdict: null, verdictDetail: null, mutationResult: null,
    },
    {
      id: 'TP-002', source: 's', kind: 'test-plan', text: 'b',
      testFile: null, testName: null,
      mutation: null, verdict: null, verdictDetail: null, mutationResult: null,
    },
  ];
  const html = renderReport(claims);
  // 2 cases in plan, 1 with test, 1 without
  assert.match(html, /Cases in plan/);
  assert.match(html, /Without a test/);
});

// ── integration: real git worktree — CAUGHT vs NAME_ONLY ──────────────────

test('processRow returns CAUGHT for a real test and NAME_ONLY for a test in name only', async () => {
  const root = tmpDir();

  // Source: a simple add function.
  const srcContent = `export function add(a, b) { return a + b; }\n`;

  // Real test: asserts the numeric result — will catch the mutation.
  const realTestContent = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/add.mjs';
test('add returns the sum of two numbers', () => { assert.equal(add(2, 3), 5); });
`;

  // Weak test: only checks that add is a function — will NOT catch the mutation.
  // Kept in a separate file so --test-name-pattern only runs this file alone.
  const weakTestContent = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/add.mjs';
test('add is callable', () => { assert.equal(typeof add, 'function'); });
`;

  try {
    // Build the repo with just the real test file (needed for git commit).
    buildGitRepo(root, { srcContent, testContent: realTestContent });

    // Add the weak test file and amend the commit.
    writeFileSync(join(root, 'test', 'add-weak.test.mjs'), weakTestContent, 'utf8');
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8', env: gitEnv });
    spawnSync('git', ['commit', '--amend', '--no-edit'], { cwd: root, encoding: 'utf8', env: gitEnv });

    const mutation = { file: 'src/add.mjs', search: 'return a + b', replace: 'return a - b' };

    // Claim 1: real check — mutation changes a+b to a-b, test catches it.
    const result1 = await processRow(
      'TP-REAL', mutation, 'test/add.test.mjs', 'add returns the sum of two numbers', root
    );
    assert.equal(result1, 'CAUGHT', `Expected CAUGHT but got ${result1}`);

    // Claim 2: the weak test survives the mutation. A witness proves the mutation
    // really broke the claim, so the survival is an accusation: NAME_ONLY.
    const witness = `export default async (load) => { const { add } = await load('src/add.mjs'); return add(2, 3) === 5; };`;
    const result2 = await processRow(
      'TP-WEAK', mutation, 'test/add-weak.test.mjs', 'add is callable', root, witness
    );
    assert.equal(result2, 'NAME_ONLY', `Expected NAME_ONLY but got ${result2}`);

    // Claim 2b: the same survival with no witness is UNPROVEN, never NAME_ONLY.
    // Review correction: five false accusations reached the first run's report
    // from mutations that looked like breaks and left the claim true.
    const result2b = await processRow(
      'TP-WEAK-NOWITNESS', mutation, 'test/add-weak.test.mjs', 'add is callable', root
    );
    assert.equal(result2b, 'UNPROVEN', `Expected UNPROVEN but got ${result2b}`);

    // Claim 2c: a mutation that leaves the claim true is WEAK_MUTATION, and nobody
    // is accused. b + a is still the sum.
    const harmless = { file: 'src/add.mjs', search: 'return a + b', replace: 'return b + a' };
    const result2c = await processRow(
      'TP-HARMLESS', harmless, 'test/add-weak.test.mjs', 'add is callable', root, witness
    );
    assert.equal(result2c, 'WEAK_MUTATION', `Expected WEAK_MUTATION but got ${result2c}`);

    // Claim 3: a name that selects no test. Node then reports the file itself as
    // one passing test and exits 0, which without this check read as NAME_ONLY:
    // a false accusation against a test that does not exist. Review correction.
    const result3 = await processRow(
      'TP-MISSING', mutation, 'test/add.test.mjs', 'add returns the sum of three numbers', root
    );
    assert.equal(result3, 'NO_SUCH_TEST', `Expected NO_SUCH_TEST but got ${result3}`);
  } finally {
    spawnSync('git', ['worktree', 'prune'], { cwd: root, encoding: 'utf8' });
    cleanup(root);
  }
});
