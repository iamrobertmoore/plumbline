// build-corpus.mjs: the rule that selected measure/corpus.json, executable.
//
// The corpus is the strongest end of GitHub: the most-starred repositories that
// ship something you can install, owned by organisations. The rule has five steps
// and no judgement in it:
//
//   1. ask GitHub for the top 400 repositories by star count
//   2. drop the ones owned by a person rather than an organisation
//   3. drop the archived ones
//   4. drop the ones with no installable manifest at the repository root
//   5. take the first 100 of what is left, still in star order
//
// Step 2 was added on 25 September 2026. The measurement publishes findings next to
// repository names, and a repository owned by a personal account names a person.
// This entry works with no personal information, so the corpus is organisation-owned
// by rule rather than by editing, and verify-corpus.mjs fails if a personal account
// ever appears in it.
//
// That is the whole selection rule. It is written down here, in code, because a
// selection rule stated only in prose is a selection rule nobody can check.
//
// IMPORTANT: this does NOT reproduce measure/corpus.json. It cannot, and it is not
// meant to. Stars drift by a few hundred a day at this end of GitHub, so step 1
// returns a different 200 every time it runs. corpus.json is a FROZEN ARTEFACT
// captured on 25 September 2026; this script is the rule that produced it. Running
// it today gives you today's corpus, which is a different and equally valid corpus.
//
// To check the committed corpus rather than rebuild it, run verify-corpus.mjs.
//
//   GH_TOKEN=$(gh auth token) node measure/build-corpus.mjs
//   GH_TOKEN=$(gh auth token) node measure/build-corpus.mjs --out corpus-today.json --source source.json
//
// --source keeps every page of the search response, projected to the fields the rule
// reads, so the selection can be re-derived from the file rather than taken on trust.
//
// Needs network (GitHub). Reads only, writes only with --out.

import { writeFileSync } from 'node:fs';

const TOKEN = process.env.GH_TOKEN || '';
const UA = 'plumbline-measure/0.1';
const H = { 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (TOKEN) H.Authorization = `Bearer ${TOKEN}`;

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const OUT = arg('--out', null);
const SOURCE = arg('--source', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The eight manifests that make a repository installable. A repository with none of
// them is a reading list, a curriculum or a template, and you cannot install it, so
// it cannot fail the install-related checks for a reason anyone cares about.
const MANIFESTS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'pom.xml', 'Gemfile', 'composer.json'];

// Step 1. The pool. Four pages of 100, the API's maximum page size. Roughly a third
// of the most-starred repositories are personal, and some of the rest have no
// manifest, so 200 is no longer enough to leave 100.
const POOL = 400;

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.status === 403 || r.status === 429) { await sleep(4000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}

const pool = [];
for (let page = 1; page <= Math.ceil(POOL / 100); page++) {
  const d = await j(`https://api.github.com/search/repositories?q=stars:%3E5000&sort=stars&order=desc&per_page=100&page=${page}`);
  if (!d || !d.items) { console.error(`page ${page} returned nothing; the pool is short and the corpus would be too`); break; }
  pool.push(...d.items);
  await sleep(1200);
}
console.error(`pool: ${pool.length} repositories`);

// Steps 2 and 3 need each repository's file tree, because the manifest is a fact
// about the tree and the search response does not carry it.
if (SOURCE) {
  writeFileSync(SOURCE, JSON.stringify(pool.map((i) => ({
    full_name: i.full_name, owner_type: (i.owner || {}).type || null, stars: i.stargazers_count,
    archived: i.archived, default_branch: i.default_branch, language: i.language,
    license: (i.license || {}).spdx_id || null, homepage: i.homepage || null,
  })), null, 1));
  console.error(`wrote ${SOURCE}`);
}

const kept = [];
for (const i of pool) {
  // Step 2. A personal account names a person. Organisations only.
  if ((i.owner || {}).type !== 'Organization') continue;
  if (i.archived) continue;
  const t = await j(`https://api.github.com/repos/${i.full_name}/git/trees/${i.default_branch}?recursive=1`);
  const paths = t && Array.isArray(t.tree) ? t.tree.filter((x) => x.type === 'blob').map((x) => x.path) : [];
  const root = paths.filter((p) => !p.includes('/'));
  const manifest = MANIFESTS.find((m) => root.includes(m)) || null;
  if (!manifest) { await sleep(90); continue; }
  kept.push({
    full_name: i.full_name,
    owner_type: i.owner.type,
    stars: i.stargazers_count,
    lang: i.language,
    manifest,
    has_license_file: root.some((p) => /^(LICENSE|LICENCE|COPYING|UNLICENSE)/i.test(p)),
    license: (i.license || {}).spdx_id || null,
    workflows: paths.filter((p) => /^\.github\/workflows\/.*\.ya?ml$/i.test(p)).map((p) => p.split('/').pop()),
    has_ci: paths.some((p) => /^\.github\/workflows\/.*\.ya?ml$/i.test(p)),
    homepage: i.homepage || null,
    default_branch: i.default_branch,
    archived: i.archived,
  });
  if (kept.length >= 100) break;
  await sleep(90);
}

// Step 5. Still in star order, which the pool already is.
const corpus = kept.slice(0, 100);
console.error(`corpus: ${corpus.length} repositories, ${corpus.reduce((a, r) => a + r.stars, 0).toLocaleString('en-GB')} stars`);

if (OUT) {
  writeFileSync(OUT, JSON.stringify(corpus, null, 1));
  console.error(`wrote ${OUT}`);
} else {
  console.log(JSON.stringify(corpus, null, 1));
}
