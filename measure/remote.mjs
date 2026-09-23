// remote.mjs: audit a GitHub repository without cloning it.
//
// This is the code behind the headline number AND behind the hosted checker, and it
// is one file on purpose. measure/audit.mjs runs it over the corpus; api/audit.js runs
// it over whatever repository a visitor pastes in. If those were two copies, the page
// a judge plays with and the number on the front page would drift apart, which is the
// defect this project keeps finding in other people's work.
//
// The checks themselves are imported from ../src, so the tool, the harness and the
// hosted page all ask the same questions in the same way.

import { claimsFromReadme, CHECKS, npmLatest, climbsAboveRoot, repoSlug } from '../src/plumbline.mjs';

export function createRemoteAuditor({ token = '', ua = 'plumbline-measure/0.1', maxLinks = 0, concurrency = 6, urlFilter = null } = {}) {
const UA = ua;
const GH = { 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (token) GH.Authorization = `Bearer ${token}`;
const MAX_LINKS = maxLinks;
const CONC = concurrency;

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
  const capped0 = MAX_LINKS > 0 ? urls.slice(0, MAX_LINKS) : urls;
  // A hosted run refuses links it will not fetch on someone else's behalf (a private or
  // loopback address, for one). Refused is counted and reported, never read as a pass.
  const allowed = urlFilter ? await Promise.all(capped0.map((u) => urlFilter(u))) : null;
  const targets = allowed ? capped0.filter((_, i) => allowed[i]) : capped0;
  const refused = capped0.length - targets.length;
  const probe = await pool(targets, CONC, async (url) => ({ url, ...(await CHECKS['link.external'].run({}, { id: 'link.external', url })) }));
  const asserted = probe.filter((p) => !p.skipped);
  const gone = asserted.filter((p) => p.ok !== true && /^(404|410)\b/.test(p.detail));
  const unreachable = asserted.filter((p) => p.ok !== true && !/^(404|410)\b/.test(p.detail));
  R.linkStats = { found: urls.length, checked: asserted.length, gone: gone.length, unreachable: unreachable.length, badges: probe.length - asserted.length, capped: MAX_LINKS > 0 && urls.length > MAX_LINKS, refused, untested: Math.max(0, urls.length - targets.length) };
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

return { auditRepo, req, GH };
}
