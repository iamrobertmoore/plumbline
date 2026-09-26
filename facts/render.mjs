// One number, one place. Every figure this entry states about itself is kept in
// facts/facts.json and bound to the phrases that carry it on each surface. Three
// surfaces once said "eleven corrections" while the method said thirteen, and the
// deck once said 18 on one slide and 23 on another. This is the fix for that class.
//
//   node facts/render.mjs --check      exit 1 if any surface disagrees, or a binding matches nothing
//   node facts/render.mjs --write      put the values from facts.json into every surface
//   node facts/render.mjs --self-test  prove --check can fail, five ways
//
// A binding that matches nothing is a failure, not a pass: it means a surface was
// rewritten and the phrase that carried the number is gone, so nobody knows whether
// the new wording is right.

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), '..');

function computed(root, kind) {
  if (kind === 'tests') {
    let n = 0;
    for (const f of readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.mjs'))) {
      // Count top-level test( lines, skipping any inside a template literal: a test
      // file that writes a fixture test file as a string is not adding a test to
      // this suite. Counting those once made the README say 88 when 86 ran.
      let inTemplate = false;
      for (const line of readFileSync(join(root, 'test', f), 'utf8').split('\n')) {
        if (!inTemplate && /^test\(/.test(line)) n++;
        const ticks = (line.replace(/\\`/g, '').match(/`/g) || []).length;
        if (ticks % 2) inTemplate = !inTemplate;
      }
    }
    return String(n);
  }
  // Figures about the worked example are read from Bob's own output, so a surface can
  // never state a Bob result the audit file does not contain.
  if (kind.startsWith('sample.')) {
    const claims = JSON.parse(readFileSync(join(root, 'examples/turnstile/.plumbline/claims.json'), 'utf8'));
    const plan = claims.filter((c) => c.kind === 'test-plan' && !/Type:\s*Manual/i.test(c.text));
    const fails = (k) => claims.filter((c) => c.kind === k && c.verdict === 'FAILS').length;
    const n = {
      'sample.automated': plan.length,
      'sample.withTest': plan.filter((c) => c.testFile != null).length,
      'sample.withoutTest': plan.filter((c) => c.testFile == null).length,
      'sample.nameOnly': plan.filter((c) => c.mutationResult === 'NAME_ONLY').length,
      'sample.specFalse': fails('spec'),
      'sample.checklistFalse': fails('checklist'),
    }[kind];
    if (n === undefined) throw new Error(`unknown computed fact ${kind}`);
    return String(n);
  }
  throw new Error(`unknown computed fact ${kind}`);
}

export function run(root = ROOT_DEFAULT, { write = false } = {}) {
  const spec = JSON.parse(readFileSync(join(root, 'facts/facts.json'), 'utf8'));
  const values = {};
  for (const [k, f] of Object.entries(spec.facts)) values[k] = f.computed ? computed(root, f.computed) : f.value;
  const problems = [];
  const changed = new Set();
  const cache = {};
  const read = (f) => (cache[f] ??= readFileSync(join(root, f), 'utf8'));

  for (const b of spec.bindings) {
    const want = values[b.fact];
    const words = spec.facts[b.fact].words;
    const re = new RegExp(b.pattern, 'g');
    for (const f of b.files) {
      let hits = 0;
      const next = read(f).replace(re, (...args) => {
        hits++;
        const groups = args.at(-1);
        const whole = args[0];
        const got = groups.v;
        const same = words ? got.toLowerCase() === want.toLowerCase() : got === want;
        if (same) return whole;
        if (!write) { problems.push(`${f}: "${whole}" says ${got}, facts.json says ${want} (${b.fact})`); return whole; }
        const repl = words && /^[A-Z]/.test(got) ? want[0].toUpperCase() + want.slice(1) : want;
        return whole.replace(got, repl);
      });
      if (!hits) problems.push(`${f}: nothing matches /${b.pattern}/ for ${b.fact}; the phrase that carried it is gone`);
      if (next !== read(f)) { cache[f] = next; changed.add(f); }
    }
  }
  for (const f of spec.staleFiles) {
    for (const s of spec.stale) if (read(f).includes(s)) problems.push(`${f}: carries a retired figure: "${s}"`);
  }
  if (write) for (const f of changed) writeFileSync(join(root, f), cache[f]);
  return { problems, changed: [...changed], values };
}

function selfTest() {
  const copy = () => {
    const d = mkdtempSync(join(tmpdir(), 'facts-'));
    for (const p of ['facts', 'test', 'README.md', 'index.html', 'deck', 'docs', 'check', 'examples']) cpSync(join(ROOT_DEFAULT, p), join(d, p), { recursive: true });
    return d;
  };
  const cases = [
    ['a surface disagrees with facts.json', (d) => { const f = join(d, 'docs/brand/cover.svg'); writeFileSync(f, readFileSync(f, 'utf8').replace(/>\d+ of 100<\/text>/, '>99 of 100</text>')); }],
    ['a surface loses the phrase that carried a number', (d) => { const f = join(d, 'README.md'); writeFileSync(f, readFileSync(f, 'utf8').replace(/\(\d+ tests\)/, '(the tests)')); }],
    ['a retired figure comes back', (d) => { const f = join(d, 'README.md'); writeFileSync(f, readFileSync(f, 'utf8') + '\n14,304,526\n'); }],
    ['a test is added and the count is not updated', (d) => { writeFileSync(join(d, 'test/extra.test.mjs'), "test('x', () => {});\n"); }],
    ["Bob's audit changes and a surface does not", (d) => { const f = join(d, 'examples/turnstile/.plumbline/claims.json'); const c = JSON.parse(readFileSync(f, 'utf8')); c.find((x) => x.mutationResult === 'NAME_ONLY').mutationResult = 'CAUGHT'; writeFileSync(f, JSON.stringify(c)); }],
  ];
  const base = copy();
  if (run(base).problems.length) { console.log('self-test needs a clean tree first:\n' + run(base).problems.join('\n')); return 1; }
  let caught = 0;
  for (const [name, breakIt] of cases) {
    const d = copy();
    breakIt(d);
    const n = run(d).problems.length;
    console.log(`${n ? 'caught ' : 'MISSED '} ${name}`);
    if (n) caught++;
  }
  console.log(`${caught} of ${cases.length} caught`);
  return caught === cases.length ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.includes('--self-test')) process.exit(selfTest());
  const { problems, changed, values } = run(ROOT_DEFAULT, { write: a.includes('--write') });
  if (a.includes('--write')) console.log(changed.length ? `updated: ${changed.join(', ')}` : 'nothing to change');
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log(`every surface agrees with facts.json (${Object.keys(values).length} facts)`);
}
