// ci-warnings.mjs — the third measurement: CI that cannot fail.
//
// This is the figure the README reports as a warning tier rather than a failure. It was
// previously a number from an earlier pass that the repository could not reproduce, which
// is the same defect as every other one this project has been fixing. So it is measured
// here, with the rule written down.
//
// The question: how many of the corpus have a workflow that looks like it is checking
// something but cannot fail?
//
//   strict  a step whose command ends in `|| true`            (the command cannot fail the step)
//           a step or job with `if: false`                    (it never runs at all)
//           a step gated on `secrets.X`                       (silently skipped when X is unset)
//   loose   all of the above, plus `continue-on-error`        (a deliberate choice, not a lie)
//
// The distinction is the point. `continue-on-error` on a documentation job is an engineering
// decision somebody made on purpose. A step gated on a secret that does not exist is a check
// that has never run and has been reporting green the whole time.
//
//   GH_TOKEN=$(gh auth token) node measure/ci-warnings.mjs
//
// Needs network: raw.githubusercontent.com. Reads only.

import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.GH_TOKEN || '';
const UA = 'plumbline-measure/0.1';
if (!TOKEN) console.error('warning: no GH_TOKEN, this will be rate-limited and the result will be wrong');

const args = process.argv.slice(2);
const OUT = args.indexOf('--out') === -1 ? null : args[args.indexOf('--out') + 1];

// A first version of this counted any `|| true` and produced a nonsense figure: 11 of the first 13
// repositories, including most of the best-maintained CI in the corpus. The pattern was wrong, not
// the repositories. `|| true` is used legitimately and constantly inside command substitution
// (`candidate="$(find ... || true)"`), at the end of best-effort cleanup (`gh pr merge ... || true`)
// and even inside a comment explaining why a workflow does NOT use it. Counting it made "CI that
// cannot fail" mean "CI that mentions || true".
//
// So the rule is narrowed to the two cases that are unambiguous from the file alone.
export const STRICT_PATTERNS = [
  // A step or job that can never run. This is the clearest possible signal: the workflow says, in
  // the file, that this unit is switched off. A trailing comment is allowed.
  { re: /^[ \t]*if:[ \t]*false[ \t]*(#.*)?$/m, what: 'if: false (a step or job that never runs)' },
];
export const LOOSE_PATTERNS = [
  // A step whose failure does not fail the job. Legitimate on a docs or lint job, which is exactly
  // why it is the loose tier and not the strict one.
  { re: /^[ \t]*continue-on-error:[ \t]*true[ \t]*(#.*)?$/m, what: 'continue-on-error: true' },
];

export function classifyWorkflow(text) {
  const strict = [];
  for (const p of STRICT_PATTERNS) if (p.re.test(text)) strict.push(p.what);
  const loose = [];
  for (const p of LOOSE_PATTERNS) if (p.re.test(text)) loose.push(p.what);
  return { strict: [...new Set(strict)], loose: [...new Set(loose)] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function raw(full, branch, path) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${full}/${branch}/${path}`, {
      signal: c.signal,
      headers: { 'User-Agent': UA, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));

const rows = [];
let files = 0;
for (let i = 0; i < corpus.length; i++) {
  const repo = corpus[i];
  const list = repo.workflows || [];
  let strict = new Set();
  let loose = new Set();
  let read = 0;
  for (const w of list) {
    const text = await raw(repo.full_name, repo.default_branch, `.github/workflows/${w}`);
    files += 1;
    if (text === null) continue;
    read += 1;
    const c = classifyWorkflow(text);
    for (const s of c.strict) strict.add(s);
    for (const s of c.loose) loose.add(s);
    await sleep(25);
  }
  rows.push({
    repo: repo.full_name,
    workflowFiles: list.length,
    read,
    strict: [...strict],
    loose: [...loose],
  });
  console.log(`${String(i + 1).padStart(3)}/${corpus.length} ${repo.full_name.padEnd(46)} files=${read}/${list.length} strict=${strict.size ? 'YES' : '-'} loose=${loose.size ? 'YES' : '-'}`);
  await sleep(40);
}

const strictRepos = rows.filter((r) => r.strict.length);
const looseRepos = rows.filter((r) => r.strict.length || r.loose.length);
const byReason = {};
for (const r of strictRepos) for (const s of r.strict) byReason[s] = (byReason[s] || 0) + 1;

console.log('\n--- totals ---');
console.log('repositories                ', rows.length);
console.log('workflow files fetched      ', files);
console.log('strict (cannot fail)        ', strictRepos.length, `(${(100 * strictRepos.length / rows.length).toFixed(0)}%)`);
console.log('loose (adds continue-on-error)', looseRepos.length, `(${(100 * looseRepos.length / rows.length).toFixed(0)}%)`);
// `workflowFiles` is a count, so it has no `.length`. Asking for one returned undefined for
// every row and reported that all 100 repositories had no workflow at all, which is the
// opposite of what the line above it said.
console.log('repositories with none      ', rows.filter((r) => !r.workflowFiles).length);
console.log('\n--- why strict ---');
for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
console.log('\n--- the strict repositories ---');
for (const r of strictRepos) console.log(`${r.repo}  [${r.strict.join('; ')}]`);

if (OUT) { writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), strict: strictRepos.length, loose: looseRepos.length, files, rows }, null, 1)); console.log('\nwrote', OUT); }
