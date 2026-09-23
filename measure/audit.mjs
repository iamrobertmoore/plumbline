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
import { claimsFromReadme, CHECKS, npmLatest, climbsAboveRoot, repoSlug } from '../src/plumbline.mjs';

const TOKEN = process.env.GH_TOKEN || '';
const UA = 'plumbline-measure/0.1';
const GH = { 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (TOKEN) GH.Authorization = `Bearer ${TOKEN}`;

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
// this corpus yield under 50 external links, vinta/awesome-python yields 543, and
// avelino/awesome-go yields 3,248. A curated link list is also exactly where dead links
// accumulate, so truncating one is the last place to save time.
const MAX_LINKS = Number(arg('--max-links', 0)) || 0;
const CONC = Number(arg('--concurrency', 6));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(url, { timeout = 15000, headers = {}, method = 'GET' } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    return await fetch(url, { method, signal: c.signal, headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
  } finally { clearTimeout(t); }
}

// A capped tree makes an existing path look like a missing one, which is a false
// accusation. When GitHub says the tree is truncated the relative-link check is
// refused rather than guessed at.
async function fetchTree(full, branch) {
  try {
    const r = await req(`https://api.github.com/repos/${full}/git/trees/${branch}?recursive=1`, { headers: GH, timeout: 25000 });
    if (!r.ok) return { paths: new Set(), dirs: new Set(), rootFiles: [], truncated: true };
    const j = await r.json();
    const all = (j.tree || []).filter((e) => e.type === 'blob').map((e) => e.path);
    const paths = new Set(all);
    const dirs = new Set();
    for (const p of all) {
      let i = p.indexOf('/');
      while (i !== -1) { dirs.add(p.slice(0, i)); i = p.indexOf('/', i + 1); }
    }
    return { paths, dirs, rootFiles: all.filter((p) => !p.includes('/')), truncated: !!j.truncated };
  } catch { return { paths: new Set(), dirs: new Set(), rootFiles: [], truncated: true }; }
}

// Fetch the README, and say WHY there is no text, because "this repository has no
// README" and "I could not reach the README" are different claims and only one of
// them is a finding.
//
// This used to return null for both, and on 23 September that published a false
// accusation against NousResearch/hermes-agent: a 1 GB repository whose tree and
// README fetches are both slow enough to fail under load. The README is there and
// always has been. A network blip is not a defect in someone else's project, and a
// harness that cannot tell those two apart is the thing this project argues against.
//
// A 404 is an answer. A 429, a 5xx or a timeout is not, so it is retried and then
// reported as unobservable rather than as a failure.
async function fetchReadme(full, branch) {
  const names = ['README.md', 'readme.md', 'README.MD', 'Readme.md', 'README.markdown', 'README.rst', 'README.txt'];
  const branches = [...new Set([branch, 'main', 'master'].filter(Boolean))];
  let failure = null;
  for (const name of names) {
    for (const br of branches) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await req(`https://raw.githubusercontent.com/${full}/${br}/${name}`, { timeout: 25000 });
          if (r.ok) return { text: await r.text(), failure: null };
          if (r.status === 404) break;   // this name and branch do not exist; try the next pair
          failure = `HTTP ${r.status}`;  // 429 or 5xx: we do not know, so we do not accuse
        } catch (e) {
          failure = e && e.name === 'AbortError' ? 'timed out' : String((e && e.message) || e);
        }
        await sleep(500 * (attempt + 1));
      }
    }
  }
  return { text: null, failure };
}

async function fetchPackageJson(full, branch) {
  for (const br of [branch, 'main', 'master']) {
    if (!br) continue;
    try {
      const r = await req(`https://raw.githubusercontent.com/${full}/${br}/package.json`);
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

// Run `size` jobs at a time. The shipped checks already do their own HEAD-then-GET
// confirmation, so this only controls how many are in flight.
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const uniqBy = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];

async function auditRepo(repo) {
  const full = repo.full_name;
  const R = { repo: full, stars: repo.stars, lang: repo.lang, checks: {}, fails: [], skipped: [] };
  const add = (id, ok, detail) => { R.checks[id] = { ok, detail }; if (!ok) R.fails.push(id); };
  const skip = (id, detail) => { R.skipped.push({ id, detail }); };

  const { paths, dirs, rootFiles, truncated } = await fetchTree(full, repo.default_branch);
  R.treeTruncated = truncated;

  // 1. the README claims a licence and GitHub shows one
  const rd = await fetchReadme(full, repo.default_branch);
  if (rd.text === null) {
    // Not being able to fetch the README is not a claim about the repository, so the
    // repository is reported as unjudged rather than as failing.
    if (rd.failure) { skip('readme.present', `could not fetch the README (${rd.failure})`); return R; }
    add('readme.present', false, 'no README found');
    return R;
  }
  add('readme.present', true, 'README found');

  const md = rd.text;
  const claims = claimsFromReadme(md);

  // 2. relative links point at files that exist
  if (!truncated) {
    const all = uniqBy(claims.filter((c) => c.id === 'link.relative'), (c) => c.path);
    // The same rule the shipped check applies, imported rather than copied. A path
    // that climbs above the repository root is not a claim about a file here, and
    // the file tree cannot answer it.
    const rel = all.filter((c) => !climbsAboveRoot(c.path));
    if (all.length !== rel.length) R.relNotObservable = all.length - rel.length;
    const missing = rel.filter((c) => {
      const clean = c.path.replace(/^\.\//, '').replace(/\/$/, '');
      let decoded = clean;
      try { decoded = decodeURIComponent(clean); } catch {}
      return !paths.has(clean) && !paths.has(decoded) && !dirs.has(clean) && !dirs.has(decoded);
    });
    R.rel = { checked: rel.length, missing: missing.slice(0, 8).map((c) => c.path) };
    if (rel.length) add('link.relative', missing.length === 0, `${missing.length} of ${rel.length} point at nothing`);
  } else {
    skip('link.relative', 'GitHub reports the tree truncated, so a missing path cannot be told from an unlisted one');
  }

  // 3. external links resolve. The shipped check does the HTTP work, so the
  //    HEAD-then-GET confirmation and the badge skip are the same code as the tool.
  const urls = uniqBy(claims.filter((c) => c.kind === 'link' && c.url), (c) => c.url).map((c) => c.url);
  const targets = MAX_LINKS > 0 ? urls.slice(0, MAX_LINKS) : urls;
  const probe = await pool(targets, CONC, async (url) => ({ url, ...(await CHECKS['link.external'].run({}, { id: 'link.external', url })) }));
  const asserted = probe.filter((p) => !p.skipped);
  const gone = asserted.filter((p) => p.ok !== true && /^(404|410)\b/.test(p.detail));
  const unreachable = asserted.filter((p) => p.ok !== true && !/^(404|410)\b/.test(p.detail));
  R.linkStats = { found: urls.length, checked: asserted.length, gone: gone.length, unreachable: unreachable.length, badges: probe.length - asserted.length, capped: MAX_LINKS > 0 && urls.length > MAX_LINKS, untested: Math.max(0, urls.length - targets.length) };
  // Why a link was unreachable, not just that it was. "Unreachable" covers a 403 from
  // a server that blocks this agent, a 429 from a rate limit, a 5xx, and a timeout,
  // and those are different facts about the network. Keeping a few makes the category
  // auditable instead of a number a reader has to take on trust.
  R.unreachableDetail = unreachable.slice(0, 5).map((p) => p.detail);
  R.deadLinks = gone.slice(0, 6).map((p) => p.detail);
  if (asserted.length) add('link.external', gone.length === 0, `${gone.length} gone, ${unreachable.length} unverifiable of ${asserted.length}`);

  // 4. the install command names a real package
  const installs = uniqBy(claims.filter((c) => c.id === 'install'), (c) => c.pkg).slice(0, 5);
  const badInstall = [];
  for (const c of installs) { const r = await CHECKS.install.run({}, c); if (r.ok !== true) badInstall.push(c.pkg); }
  R.installs = installs.map((c) => c.pkg);
  if (installs.length) add('install', badInstall.length === 0, badInstall.length ? `no such package: ${badInstall.join(', ')}` : `${installs.length} ok`);

  // 5/6. the manifest version is published, and versions named in the README exist.
  //      The registry-repository guard lives in the shipped check, so a name
  //      collision is a skip here for the same reason it is a skip there.
  if (repo.manifest === 'package.json') {
    const pj = await fetchPackageJson(full, repo.default_branch);
    if (pj && pj.private !== true && pj.name && pj.version) {
      const r = await CHECKS['manifest.version'].run({}, {
        id: 'manifest.version', name: pj.name, version: pj.version, repository: pj.repository,
      });
      R.manifest = { name: pj.name, local: pj.version, detail: r.detail };
      if (r.skipped) skip('manifest.version', r.detail);
      else add('manifest.version', r.ok, r.detail);

      const info = await npmLatest(pj.name);
      // The same guard the manifest check uses, for the same reason. If the name on
      // the registry belongs to a different project, the versions named in the README
      // are not that project's versions. nvm's README names Node.js versions, and
      // comparing them against an unrelated npm package called "nvm" produced six
      // findings out of nothing.
      if (info && info.versions && repoSlug(info.repository) === full.toLowerCase()) {
        const esc = pj.name.replace(/[/@]/g, (c) => '\\' + c);
        const named = [...new Set([...md.matchAll(new RegExp(esc + '[^\\n]{0,14}?(\\d+\\.\\d+\\.\\d+)', 'g'))].map((m) => m[1]))];
        if (named.length) {
          const phantom = named.filter((v) => !info.versions.includes(v));
          R.namedVersions = named;
          add('readme.versions', phantom.length === 0, phantom.length ? `README names unpublished ${phantom.join(', ')}` : `README names ${named.join(', ')}`);
        }
      } else if (info && info.versions) {
        skip('readme.versions', `${pj.name} on npm points at ${info.repository || 'nothing'}, not at ${full}`);
      }
    }
  }

  // 7. licence. The shipped check wants the root file list and the About panel.
  const lic = await CHECKS['license.claimed'].run(
    { root: '/', rootFiles, githubLicense: repo.license },
    { id: 'license.claimed', kind: 'license', text: 'README refers to a licence' },
  );
  if (lic.skipped) skip('license.claimed', lic.detail);
  else add('license.claimed', lic.ok, lic.detail);

  return R;
}

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
// --repo exists so that a single finding can be re-checked on its own, which is how
// every candidate in this measurement is confirmed. Re-checking one repository by hand
// should not require re-running the other ninety-nine.
const todo = REPO ? corpus.filter((r) => r.full_name.includes(REPO)) : (ONLY ? corpus.slice(0, ONLY) : corpus);
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
