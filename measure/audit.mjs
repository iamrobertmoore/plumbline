// audit.mjs — reproduce the headline number.
//
// This is the harness behind the figure on the front page. It walks the corpus in
// corpus.json, runs the SHIPPED checks from ../src against each repository, and
// prints the table.
//
// The checks are imported rather than re-implemented. Two copies of a rule drift
// apart, and once they do the published number stops describing the published tool.
// The single exception is the relative-path check: the shipped version answers it
// against the local filesystem, and here the same question is put to GitHub's file
// tree, because the repository is remote.
//
// What this prints is a CANDIDATE set. Every candidate is then confirmed by hand,
// and the corrections in docs/MEASUREMENT.md name exactly what that pass changed.
// A harness that reports its own answer without being checked is the thing this
// whole project is about.
//
//   node measure/audit.mjs              # the whole corpus
//   node measure/audit.mjs --only 8     # a pilot, first 8 repositories
//   node measure/audit.mjs --out r.json # also write the raw result
//   node measure/audit.mjs --repo hermes  # re-check one repository by hand
//   node measure/audit.mjs --max-links 25 # a pilot: only the first 25 links per repository
//
// Needs network: GitHub and the npm registry. Reads only, writes nothing but --out.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRemoteAuditor } from './remote.mjs';

const TOKEN = process.env.GH_TOKEN || '';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const ONLY = Number(arg('--only', 0)) || 0;
const REPO = arg('--repo', null);
const OUT = arg('--out', null);
// No cap by default, and any cap that is set is REPORTED.
//
// This used to default to 25. 21 of the 100 repositories in this corpus have more
// asserted external links than that, so their READMEs were only partly tested and the
// published link figure was a lower bound nobody had stated. A bound is where a silent
// truncation hides, so there is no longer a bound by default, and if --max-links is used
// the run prints how many links it found, how many it tested, and which repositories
// reached the cap.
//
// The cost of removing it is one slow repository. Measured 23 September: most READMEs in
// this corpus yield under 50 external links, while a curated "awesome" list can yield
// several thousand. A curated link list is also exactly where dead links
// accumulate, so truncating one is the last place to save time.
const MAX_LINKS = Number(arg('--max-links', 0)) || 0;
const CONC = Number(arg('--concurrency', 6));


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Everything that talks to GitHub and the registry lives in remote.mjs, shared with the
// hosted checker so the page and the number cannot drift apart.
const { auditRepo } = createRemoteAuditor({ token: TOKEN, maxLinks: MAX_LINKS, concurrency: CONC });

// --corpus reads a different corpus file; --slice a:b audits entries a to b-1 of it, so a
// long run can be split into pieces and the pieces merged. Neither changes what is checked.
const CORPUS = arg('--corpus', null);
const corpus = JSON.parse(readFileSync(CORPUS || new URL('./corpus.json', import.meta.url), 'utf8'));
const SLICE = arg('--slice', null);
// --repo exists so that a single finding can be re-checked on its own, which is how
// every candidate in this measurement is confirmed. Re-checking one repository by hand
// should not require re-running the other ninety-nine.
const todo = REPO ? corpus.filter((r) => r.full_name.includes(REPO)) : SLICE ? corpus.slice(...SLICE.split(':').map(Number)) : (ONLY ? corpus.slice(0, ONLY) : corpus);
if (!TOKEN) console.error('warning: no GH_TOKEN, GitHub will rate-limit this run');

const results = [];
const t0 = Date.now();
for (let i = 0; i < todo.length; i++) {
  const repo = todo[i];
  const s = Date.now();
  try {
    const r = await auditRepo(repo);
    r.ms = Date.now() - s;
    results.push(r);
    console.log(`${String(i + 1).padStart(3)}/${todo.length} ${repo.full_name.padEnd(46)} fails=${r.fails.length} [${r.fails.join(', ')}]`);
  } catch (e) {
    results.push({ repo: repo.full_name, stars: repo.stars, error: String(e), fails: [], checks: {} });
    console.log(`${String(i + 1).padStart(3)}/${todo.length} ${repo.full_name.padEnd(46)} ERROR ${e}`);
  }
  await sleep(60);
}

const perCheck = {};
for (const r of results) for (const f of r.fails) perCheck[f] = (perCheck[f] || 0) + 1;
const failing = results.filter((r) => r.fails.length);
const checkFailures = results.reduce((a, r) => a + r.fails.length, 0);
const stars = results.reduce((a, r) => a + (r.stars || 0), 0);

// A repository that was not judged and a repository that was judged and passed look
// identical in a list of failures, and both look like a clean run. They are not the
// same thing, so both are named. The errored set is the worse of the two: the catch
// above records a thrown repository with fails: [], so it contributes nothing and the
// run reads as clean. That is how a missing import once hid fifteen repositories.
const notJudged = results.filter((r) => !r.error && !r.fails.length && (r.skipped || []).length);
const errored = results.filter((r) => r.error);

// A third category, and the one that made the figure unstable.
//
// A link that could not be reached was not tested, and an untested link is not a link
// that works. Before this was named, such a repository counted as a clean pass, which
// is the same defect as the link cap: a bound nobody reported, hiding whatever is past
// it. It is also why two runs of the shipped code returned 22 and 26 on 23 September
// with the same corpus and the same parser. In the run that returned 22, 53 links
// across these repositories were unreachable and therefore never tested; in the run
// that returned 26, they answered, and some of them were dead.
//
// These are not failures. Unreachable is not evidence of a defect. They are also not
// passes, and the headline has to say how many of the passes were complete.
const partlyTested = results.filter((r) => !r.error && !r.fails.length && ((r.linkStats || {}).unreachable || 0) > 0);

console.log('\n--- per check (repositories failing) ---');
for (const [k, v] of Object.entries(perCheck).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
// What the link cap did, stated rather than left to be found. "Found" and "tested"
// are different numbers and a reader is entitled to both.
const linksFound = results.reduce((a, r) => a + ((r.linkStats || {}).found || 0), 0);
const linksTested = results.reduce((a, r) => a + ((r.linkStats || {}).checked || 0), 0);
const capped = results.filter((r) => (r.linkStats || {}).capped);

console.log('\n--- totals ---');
console.log('repositories audited   ', results.length);
console.log('stars between them     ', stars.toLocaleString('en-US'));
console.log('check failures         ', checkFailures);
console.log('repositories failing   ', failing.length, `(${(100 * failing.length / results.length).toFixed(0)}%)`);
console.log('wall clock             ', ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log('mean per repository    ', (results.reduce((a, r) => a + (r.ms || 0), 0) / results.length / 1000).toFixed(1) + 's');
console.log('slowest                ', (Math.max(...results.map((r) => r.ms || 0)) / 1000).toFixed(1) + 's');
console.log('not judged             ', notJudged.length, '(fetched nothing to judge, so they count as neither pass nor fail)');
console.log('errored                ', errored.length, '(a thrown repository contributes no failures and must not read as clean)');
console.log('not fully tested       ', partlyTested.length, '(no failure found, but some links could not be reached and were never tested)');

console.log('\n--- the link cap ---');
console.log('external links found   ', linksFound);
console.log('external links tested  ', linksTested);
console.log('external links unreached', results.reduce((a, r) => a + ((r.linkStats || {}).unreachable || 0), 0), '(status 0 or a timeout, so untested rather than dead)');
console.log('repositories capped    ', capped.length, MAX_LINKS > 0 ? `(more than ${MAX_LINKS} links, so the tail was not tested)` : '(no cap is set, so there is no tail to test)');
for (const r of capped) console.log(`  ${r.repo}  found ${r.linkStats.found}, tested ${r.linkStats.checked}`);
if (!capped.length) console.log('  none: every external link the parser found was tested');

console.log('\n--- the failing repositories ---');
for (const r of failing) console.log(`${r.repo}  [${r.fails.join(', ')}]`);

if (notJudged.length) {
  console.log('\n--- not judged, so excluded from the count ---');
  for (const r of notJudged) console.log(`${r.repo}  ${(r.skipped || []).map((s) => `${s.id}: ${s.detail}`).join('; ')}`);
}
if (errored.length) {
  console.log('\n--- errored, so excluded from the count ---');
  for (const r of errored) console.log(`${r.repo}  ${r.error}`);
}
console.log('\n--- why links were unreachable ---');
{
  const tally = {};
  for (const r of results) for (const d of (r.unreachableDetail || [])) {
    const code = String(d).split(' ')[0] || 'unknown';
    tally[code] = (tally[code] || 0) + 1;
  }
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
  console.log('  (a sample of five per repository; a 403 is a server blocking this agent,');
  console.log('   a 429 is a rate limit, ERR is a timeout or a name that does not resolve)');
}

if (partlyTested.length) {
  console.log('\n--- passed, but not fully tested: some links were never reached ---');
  console.log('These are not failures. They are also not clean, and a run that reports');
  console.log('them as clean is understating the count rather than overstating it.');
  for (const r of partlyTested) console.log(`${r.repo}  ${r.linkStats.unreachable} of ${r.linkStats.checked + r.linkStats.unreachable} links unreached`);
}

if (OUT) { writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), corpus: todo.length, perCheck, failing: failing.length, checkFailures, stars, notJudged: notJudged.length, errored: errored.length, partlyTested: partlyTested.length, partlyTestedRepos: partlyTested.map((r) => ({ repo: r.repo, unreached: r.linkStats.unreachable })), results }, null, 1)); console.log('\nwrote', OUT); }
