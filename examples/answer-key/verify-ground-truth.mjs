// Proves the recorded ground truth for the Turnstile sample, rather than asserting it.
// For every automated case: break the behaviour it describes, then run the tests.
//   tested     -> the mapped test must FAIL under the break (it really tests the claim)
//   name_only  -> the mapped test must still PASS, and so must the whole suite (nothing guards it)
//   untested   -> the whole suite must still PASS (nothing guards it)
// Also: the unbroken suite passes, every mapped test name exists exactly once, and every test is accounted for.
// Usage: node verify-ground-truth.mjs <path-to-turnstile> [--self-test]
import { readFileSync, writeFileSync, mkdtempSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
const selfTest = process.argv.includes('--self-test');
const truth = JSON.parse(readFileSync(join(here, 'ground-truth.json'), 'utf8'));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function copy() {
  const d = mkdtempSync(join(tmpdir(), 'turnstile-'));
  for (const p of ['src', 'test', 'package.json']) cpSync(join(target, p), join(d, p), { recursive: true });
  return d;
}
function mutate(dir, muts) {
  for (const [file, find, replace] of muts) {
    const f = join(dir, file);
    const s = readFileSync(f, 'utf8');
    const n = s.split(find).length - 1;
    if (n !== 1) throw new Error(`mutation target found ${n} times in ${file}: ${JSON.stringify(find)}`);
    writeFileSync(f, s.replace(find, () => replace));
  }
}
function run(dir, args) {
  const r = spawnSync(process.execPath, ['--test', ...args], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
  return r.status;
}
const suite = (dir) => run(dir, readdirSync(join(dir, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => 'test/' + f));
const one = (dir, c) => run(dir, [`--test-name-pattern=^${esc(c.test)}$`, c.file]);

const problems = [];
const base = copy();
if (suite(base) !== 0) problems.push('the unbroken suite does not pass');

// Test names in the suite, read from source.
const names = [];
for (const f of readdirSync(join(target, 'test')).filter((f) => f.endsWith('.test.mjs')))
  for (const m of readFileSync(join(target, 'test', f), 'utf8').matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)) names.push(m[1]);
const mapped = truth.cases.filter((c) => c.test).map((c) => c.test);
for (const n of mapped) if (names.filter((x) => x === n).length !== 1) problems.push(`mapped test not found exactly once: ${n}`);
for (const n of names) if (!mapped.includes(n) && !truth.extra_tests.includes(n)) problems.push(`test not accounted for: ${n}`);

const tally = { tested: 0, name_only: 0, untested: 0, manual: 0, unimplemented: 0 };
for (const c of truth.cases) {
  if (c.status === 'manual') { tally.manual++; continue; }
  if (!c.mutation.length) { tally.unimplemented++; tally[c.status]++; continue; }
  // --self-test: flip every expectation, so a verifier that cannot fail is caught.
  const d = copy();
  mutate(d, c.mutation);
  let ok;
  if (c.status === 'tested') ok = one(d, c) !== 0;
  else if (c.status === 'name_only') ok = one(d, c) === 0 && suite(d) === 0;
  else ok = suite(d) === 0;
  if (selfTest) ok = !ok;
  if (!ok) problems.push(`${c.id} (${c.status}) did not behave as recorded`);
  tally[c.status]++;
  process.stdout.write(ok ? '.' : 'x');
}
console.log('\n', tally);
if (selfTest) {
  const expectFailures = truth.cases.filter((c) => c.status !== 'manual' && c.mutation.length).length;
  const got = problems.filter((p) => /did not behave/.test(p)).length;
  console.log(`self-test: ${got} of ${expectFailures} flipped expectations were caught`);
  process.exit(got === expectFailures ? 0 : 1);
}
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('ground truth holds');
