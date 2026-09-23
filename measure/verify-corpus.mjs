// verify-corpus.mjs — check the committed corpus against the rule that made it.
//
// build-corpus.mjs cannot reproduce corpus.json, because stars drift. What CAN be
// checked is whether the committed file is consistent with the rule and with the
// figures published from it. That is what this does.
//
// It is a control, not a summary. Every check below is written so that it fails on
// a specific corruption, and `--self-test` mutates a copy of the corpus to prove
// each one can actually fire. A check that cannot fail is not a check.
//
//   node measure/verify-corpus.mjs
//   node measure/verify-corpus.mjs --self-test
//
// Reads only.

import { readFileSync } from 'node:fs';

const FILE = new URL('./corpus.json', import.meta.url);
const MANIFESTS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'pom.xml', 'Gemfile', 'composer.json'];

// The figures published in docs/MEASUREMENT.md, frozen with the corpus they describe.
// If the corpus changes and these do not, the document is wrong, and this fails.
const EXPECTED = {
  count: 100,
  stars: 14304526,
  manifests: { 'package.json': 65, 'pyproject.toml': 25, 'go.mod': 4, 'Cargo.toml': 3, 'setup.py': 2, 'pom.xml': 1 },
};

const corpus = JSON.parse(readFileSync(FILE, 'utf8'));

function check(c, fails) {
  const bad = [];
  const want = (cond, msg) => { if (!cond) bad.push(msg); };

  want(Array.isArray(c), 'corpus is not an array');
  want(c.length === EXPECTED.count, `corpus has ${c.length} entries, expected ${EXPECTED.count}`);

  const names = c.map((r) => r.full_name);
  want(new Set(names).size === names.length, 'the corpus contains a duplicate repository');

  // The rule takes the top of a star-sorted list, so the file must still be in star
  // order. If it is not, either it was re-sorted or entries were spliced in, and in
  // both cases it is no longer the corpus the rule describes.
  for (let i = 1; i < c.length; i++) {
    if (c[i].stars > c[i - 1].stars) { bad.push(`not in star order at ${i}: ${c[i].full_name} (${c[i].stars}) follows ${c[i - 1].full_name} (${c[i - 1].stars})`); break; }
  }

  // Step 3 of the rule: an installable manifest at the root, or the repository is
  // not in the corpus at all. An entry without one means the filter did not run.
  for (const r of c) {
    if (!MANIFESTS.includes(r.manifest)) bad.push(`${r.full_name} has manifest ${JSON.stringify(r.manifest)}, which is not installable`);
  }

  // Step 2: archived repositories are dropped. An archived entry means the filter
  // ran against a stale search response.
  const archived = c.filter((r) => r.archived).map((r) => r.full_name);
  if (archived.length) bad.push(`archived repositories present: ${archived.join(', ')}`);

  // has_ci is a summary of workflows, and a summary that disagrees with its own list
  // is the same defect as a published number that disagrees with its tool.
  for (const r of c) {
    const derived = (r.workflows || []).length > 0;
    if (derived !== !!r.has_ci) bad.push(`${r.full_name}: has_ci is ${r.has_ci} but workflows lists ${(r.workflows || []).length}`);
  }

  // The audit needs a branch to fetch trees and READMEs from.
  for (const r of c) if (!r.default_branch) bad.push(`${r.full_name} has no default_branch`);

  // The published star total is a claim about this file. Recompute it.
  const stars = c.reduce((a, r) => a + (r.stars || 0), 0);
  want(stars === EXPECTED.stars, `star total is ${stars.toLocaleString('en-GB')}, docs publish ${EXPECTED.stars.toLocaleString('en-GB')}`);

  // The published composition is a claim about this file too.
  const counts = {};
  for (const r of c) counts[r.manifest] = (counts[r.manifest] || 0) + 1;
  const published = Object.entries(EXPECTED.manifests).sort().map(([k, v]) => `${k}=${v}`).join(' ');
  const actual = Object.entries(counts).sort().map(([k, v]) => `${k}=${v}`).join(' ');
  want(actual === published, `composition is ${actual}, docs publish ${published}`);

  fails.push(...bad);
  return bad;
}

if (process.argv.includes('--self-test')) {
  // Mutate one thing at a time and require the check to notice. If a mutation passes,
  // the check guarding it is decorative.
  const clone = () => JSON.parse(JSON.stringify(corpus));
  const cases = [
    ['duplicate entry', (c) => { c[1] = { ...c[0] }; }],
    ['out of star order', (c) => { const t = c[5].stars; c[5].stars = c[4].stars + 1; c[6].stars = t; }],
    ['manifest made non-installable', (c) => { c[3].manifest = 'README.md'; }],
    ['archived entry present', (c) => { c[7].archived = true; }],
    ['has_ci disagrees with workflows', (c) => { c[9].has_ci = !c[9].has_ci; }],
    ['default_branch removed', (c) => { delete c[11].default_branch; }],
    ['a star count moved', (c) => { c[13].stars -= 1; }],
    ['an entry removed', (c) => { c.pop(); }],
  ];
  let failures = 0;
  for (const [name, mutate] of cases) {
    const c = clone();
    mutate(c);
    const fails = [];
    check(c, fails);
    if (fails.length === 0) { console.log(`  SELF-TEST FAIL  ${name}: nothing fired`); failures++; }
    else console.log(`  self-test ok    ${name}: ${fails[0]}`);
  }
  console.log(failures ? `\n${failures} of ${cases.length} controls did not fire. The checks they guard are decorative.`
    : `\nall ${cases.length} controls fired.`);
  process.exit(failures ? 1 : 0);
}

const fails = [];
check(corpus, fails);
if (fails.length) {
  console.log('FAIL');
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
const stars = corpus.reduce((a, r) => a + r.stars, 0);
console.log(`OK  ${corpus.length} repositories, ${stars.toLocaleString('en-GB')} stars, all installable, none archived, in star order.`);
