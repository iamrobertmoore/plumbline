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
const OUT = arg('--out', null);
const MAX_LINKS = Number(arg('--max-links', 25));
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

async function fetchReadme(full, branch) {
  for (const name of ['README.md', 'readme.md', 'README.MD', 'Readme.md', 'README.markdown', 'README.rst', 'README.txt']) {
    for (const br of [branch, 'main', 'master']) {
      if (!br) continue;
      try {
        const r = await req(`https://raw.githubusercontent.com/${full}/${br}/${name}`);
        if (r.ok) return await r.text();
      } catch {}
    }
  }
  return null;
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
  if (rd === null) { add('readme_present', false, 'no README found'); return R; }
  add('readme_present', true, 'README found');

  const md = rd;
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
    if (rel.length) add('readme_relative_links_resolve', missing.length === 0, `${missing.length} of ${rel.length} point at nothing`);
  } else {
    skip('readme_relative_links_resolve', 'GitHub reports the tree truncated, so a missing path cannot be told from an unlisted one');
  }

  // 3. external links resolve. The shipped check does the HTTP work, so the
  //    HEAD-then-GET confirmation and the badge skip are the same code as the tool.
  const urls = uniqBy(claims.filter((c) => c.kind === 'link' && c.url), (c) => c.url).map((c) => c.url);
  const probe = await pool(urls.slice(0, MAX_LINKS), CONC, async (url) => ({ url, ...(await CHECKS['link.external'].run({}, { id: 'link.external', url })) }));
  const asserted = probe.filter((p) => !p.skipped);
  const gone = asserted.filter((p) => p.ok !== true && /^(404|410)\b/.test(p.detail));
  const unreachable = asserted.filter((p) => p.ok !== true && !/^(404|410)\b/.test(p.detail));
  R.linkStats = { checked: asserted.length, gone: gone.length, unreachable: unreachable.length, badges: probe.length - asserted.length };
  R.deadLinks = gone.slice(0, 6).map((p) => p.detail);
  if (asserted.length) add('readme_external_links_resolve', gone.length === 0, `${gone.length} gone, ${unreachable.length} unverifiable of ${asserted.length}`);

  // 4. the install command names a real package
  const installs = uniqBy(claims.filter((c) => c.id === 'install'), (c) => c.pkg).slice(0, 5);
  const badInstall = [];
  for (const c of installs) { const r = await CHECKS.install.run({}, c); if (r.ok !== true) badInstall.push(c.pkg); }
  R.installs = installs.map((c) => c.pkg);
  if (installs.length) add('install_command_resolves', badInstall.length === 0, badInstall.length ? `no such package: ${badInstall.join(', ')}` : `${installs.length} ok`);

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
      if (r.skipped) skip('manifest_version_published', r.detail);
      else add('manifest_version_published', r.ok, r.detail);

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
          add('readme_versions_exist', phantom.length === 0, phantom.length ? `README names unpublished ${phantom.join(', ')}` : `README names ${named.join(', ')}`);
        }
      } else if (info && info.versions) {
        skip('readme_versions_exist', `${pj.name} on npm points at ${info.repository || 'nothing'}, not at ${full}`);
      }
    }
  }

  // 7. licence. The shipped check wants the root file list and the About panel.
  const lic = await CHECKS['license.claimed'].run(
    { root: '/', rootFiles, githubLicense: repo.license },
    { id: 'license.claimed', kind: 'license', text: 'README refers to a licence' },
  );
  if (lic.skipped) skip('license_detectable', lic.detail);
  else add('license_detectable', lic.ok, lic.detail);

  return R;
}

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
const todo = ONLY ? corpus.slice(0, ONLY) : corpus;
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

console.log('\n--- per check (repositories failing) ---');
for (const [k, v] of Object.entries(perCheck).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
console.log('\n--- totals ---');
console.log('repositories audited   ', results.length);
console.log('stars between them     ', stars.toLocaleString('en-US'));
console.log('check failures         ', checkFailures);
console.log('repositories failing   ', failing.length, `(${(100 * failing.length / results.length).toFixed(0)}%)`);
console.log('wall clock             ', ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log('mean per repository    ', (results.reduce((a, r) => a + (r.ms || 0), 0) / results.length / 1000).toFixed(1) + 's');
console.log('slowest                ', (Math.max(...results.map((r) => r.ms || 0)) / 1000).toFixed(1) + 's');

console.log('\n--- the failing repositories ---');
for (const r of failing) console.log(`${r.repo}  [${r.fails.join(', ')}]`);

if (OUT) { writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), corpus: todo.length, perCheck, failing: failing.length, checkFailures, stars, results }, null, 1)); console.log('\nwrote', OUT); }
