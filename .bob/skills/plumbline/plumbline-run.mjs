#!/usr/bin/env node
// plumbline-run.mjs — mutation runner.
//
// For every mapped claim in .plumbline/claims.json:
//   1. Run the mapped test on the unbroken code (baseline). If the baseline
//      fails, record BASELINE_FAIL and skip the mutation.
//   2. Apply the mutation in a throwaway git worktree.
//   3. Run only that test (anchored --test-name-pattern).
//   4. Record CAUGHT (test failed ← good) or NAME_ONLY (test still passed ← bad).
//   5. Always remove the worktree (finally).
//
// Mutation's search string must appear exactly once in the file or the row is
// recorded as MUTATION_INVALID.
//
// Zero external dependencies. Node >= 20.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ── paths ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
// When run from the skill folder, the repo root is cwd. When imported in
// tests the caller sets cwd explicitly, so we always use process.cwd().
const REPO_ROOT = process.cwd();

function claimsPath() {
  const primary = join(REPO_ROOT, '.plumbline', 'claims.json');
  if (existsSync(primary)) return primary;
  const fallback = join(REPO_ROOT, 'claims.json');
  if (existsSync(fallback)) return fallback;
  return primary; // will produce a clean "not found" error on read
}

// ── git guard ──────────────────────────────────────────────────────────────

function assertGit() {
  const which = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (which.status !== 0) {
    console.error('plumbline-run: git not found. Install git and try again.');
    process.exit(1);
  }
  if (!existsSync(join(REPO_ROOT, '.git'))) {
    console.error(`plumbline-run: no .git directory at ${REPO_ROOT}. Run from the repository root.`);
    process.exit(1);
  }
}

// ── claims I/O ────────────────────────────────────────────────────────────

export function loadClaims(path) {
  const p = path ?? claimsPath();
  const raw = readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

export function saveClaims(claims, path) {
  const p = path ?? claimsPath();
  writeFileSync(p, JSON.stringify(claims, null, 2) + '\n', 'utf8');
}

// ── mutation application ───────────────────────────────────────────────────

/**
 * Apply a single {file, search, replace} mutation inside `worktreePath`.
 * Throws if `search` does not appear exactly once.
 */
export function applyMutation(worktreePath, mutation) {
  // The skill allows a two-line change as parallel arrays. Apply each pair in turn,
  // with the same exactly-once rule for every one.
  if (Array.isArray(mutation.search)) {
    if (!Array.isArray(mutation.replace) || mutation.replace.length !== mutation.search.length) {
      throw new Error('MUTATION_INVALID: search and replace arrays differ in length');
    }
    mutation.search.forEach((s, i) => applyMutation(worktreePath, { file: mutation.file, search: s, replace: mutation.replace[i] }));
    return;
  }
  const abs = join(worktreePath, mutation.file);
  const original = readFileSync(abs, 'utf8');

  // Count occurrences.
  const search = mutation.search;
  const first = original.indexOf(search);
  if (first === -1) {
    throw new Error(`MUTATION_INVALID: search string not found in ${mutation.file}`);
  }
  const second = original.indexOf(search, first + 1);
  if (second !== -1) {
    throw new Error(`MUTATION_INVALID: search string appears more than once in ${mutation.file}`);
  }

  const mutated = original.slice(0, first) + mutation.replace + original.slice(first + search.length);
  writeFileSync(abs, mutated, 'utf8');
}

// ── test runner ────────────────────────────────────────────────────────────

/**
 * Run a single test file, filtered to `testName`, inside `worktreePath`.
 * Returns { code, ran }: the exit code, and how many tests actually ran.
 *
 * Review correction (25 Sep): a name pattern that matches nothing makes
 * `node --test` run zero tests and exit 0. Reading only the exit code, that
 * looked like a pass, and a mistyped test name would have been reported as a
 * test in name only. The TAP summary says how many tests ran, so it is read.
 */
export function runTestCounted(worktreePath, testFile, testName) {
  // Anchor the pattern so "login" does not accidentally match "login admin".
  const escaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `^${escaped}$`;

  // Strip NODE_TEST_* env vars so the child process does not inherit the
  // parent test runner's context (which would cause Node to skip running files
  // and exit 0, producing a false NAME_ONLY result).
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST'))
  );

  const result = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-name-pattern', pattern, testFile],
    { cwd: worktreePath, encoding: 'utf8', timeout: 30_000, env }
  );
  // Count the top-level results whose name IS the test we asked for. Node reports
  // the test file itself as one passing test when the pattern matches nothing, so
  // counting results, or reading "# pass 1", cannot tell a match from a miss.
  const names = [...(result.stdout || '').matchAll(/^(?:not )?ok \d+ - (.*)$/gm)]
    .map((x) => x[1].replace(/ # (?:SKIP|TODO).*$/, '').replace(/\\#/g, '#').replace(/\\\\/g, '\\'));
  const ran = names.filter((n) => n === testName).length;
  return { code: result.status ?? 1, ran };
}

/** Exit code only, for callers that already know the test exists. */
export function runTest(worktreePath, testFile, testName) {
  return runTestCounted(worktreePath, testFile, testName).code;
}

// ── baseline check ─────────────────────────────────────────────────────────

/**
 * Run the test on the unbroken repository to confirm it passes.
 * Returns true if it passes, false if it already fails.
 */
export function runBaseline(testFile, testName, root) {
  return runTest(root ?? REPO_ROOT, testFile, testName) === 0;
}

/** How many tests the anchored name selects on the unbroken code. */
export function countMatching(testFile, testName, root) {
  return runTestCounted(root ?? REPO_ROOT, testFile, testName).ran;
}

// ── per-row orchestrator ───────────────────────────────────────────────────

/**
 * Process one mapped claim row.
 * Returns one of: CAUGHT | NAME_ONLY | NO_SUCH_TEST | BASELINE_FAIL | MUTATION_INVALID | ERROR
 */
export async function processRow(claimId, mutation, testFile, testName, root) {
  const repoRoot = root ?? REPO_ROOT;

  // Worktree lives in the OS temp dir, not inside the repo, so relative
  // imports in the test files resolve against the worktree's own source tree.
  // Use a unique suffix via Date.now() + random; do NOT pre-create the dir
  // because git worktree add requires the target to not exist.
  const wtPath = join(tmpdir(), `plumbline-wt-${claimId}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // 1. Baseline. The name must select exactly one test, and it must pass.
  const base = runTestCounted(repoRoot, testFile, testName);
  if (base.ran !== 1) return 'NO_SUCH_TEST';
  if (base.code !== 0) return 'BASELINE_FAIL';

  // 2. Worktree add — path is pre-generated but not yet created
  const add = spawnSync('git', ['worktree', 'add', wtPath, 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (add.status !== 0) {
    return 'ERROR';
  }

  try {
    // 3. Apply mutation
    try {
      applyMutation(wtPath, mutation);
    } catch (e) {
      if (e.message.startsWith('MUTATION_INVALID')) return 'MUTATION_INVALID';
      return 'ERROR';
    }

    // 4. Run test
    const after = runTestCounted(wtPath, testFile, testName);
    if (after.ran !== 1 && after.code === 0) return 'NO_SUCH_TEST';
    return after.code !== 0 ? 'CAUGHT' : 'NAME_ONLY';
  } finally {
    // 5. Always clean up
    spawnSync('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  assertGit();

  const cp = claimsPath();
  if (!existsSync(cp)) {
    console.error(`plumbline-run: claims file not found at ${cp}`);
    process.exit(1);
  }

  const claims = loadClaims(cp);
  const rows = claims.filter(
    (c) => c.mutation != null && c.testFile != null && c.testName != null
  );

  if (rows.length === 0) {
    console.log('plumbline-run: no mapped mutations to process. Done.');
    process.exit(0);
  }

  let caught = 0, nameOnly = 0, baselineFail = 0, invalid = 0, noSuch = 0, errors = 0;

  for (const row of rows) {
    const result = await processRow(row.id, row.mutation, row.testFile, row.testName);
    row.mutationResult = result;

    switch (result) {
      case 'CAUGHT':        caught++;       break;
      case 'NAME_ONLY':     nameOnly++;     break;
      case 'BASELINE_FAIL': baselineFail++; break;
      case 'MUTATION_INVALID': invalid++;   break;
      case 'NO_SUCH_TEST':  noSuch++;       break;
      default:              errors++;       break;
    }

    console.log(`  ${row.id}: ${result}`);
  }

  saveClaims(claims, cp);

  // Regenerate the report if the renderer exists alongside this script.
  const rendererPath = join(dirname(__filename), 'render-report.mjs');
  if (existsSync(rendererPath)) {
    const { renderReport } = await import(rendererPath);
    const htmlOut = cp.replace('claims.json', 'report.html');
    writeFileSync(htmlOut, renderReport(claims), 'utf8');
    console.log(`plumbline-run: report written to ${htmlOut}`);
  }

  console.log(
    `plumbline-run: ${rows.length} rows — ` +
    `CAUGHT=${caught} NAME_ONLY=${nameOnly} ` +
    `BASELINE_FAIL=${baselineFail} MUTATION_INVALID=${invalid} NO_SUCH_TEST=${noSuch} ERROR=${errors}`
  );
}

// Run when invoked directly (not imported as a module).
if (process.argv[1] === __filename) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
