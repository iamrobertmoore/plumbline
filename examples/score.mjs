#!/usr/bin/env node
// Scores Bob's audit of the Turnstile sample against the answer key, case by case.
//
//   node examples/score.mjs            prints the score
//   node examples/score.mjs --json     prints it as JSON
//
// Bob's audit:   examples/turnstile/.plumbline/claims.json  (written by Bob, tasks 04 to 08)
// The key:       examples/answer-key/ground-truth.json and documents-truth.json
//                (written before Bob ran, kept outside the sample so Bob could not read it)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const claims = load('turnstile/.plumbline/claims.json');
const key = load('answer-key/ground-truth.json');
const docs = load('answer-key/documents-truth.json');

const caseId = (c) => /^(TC-\d+)/.exec(c.text)?.[1];
const bob = new Map(claims.filter((c) => c.kind === 'test-plan').map((c) => [caseId(c), c]));

// ── Test plan: reading and mapping ─────────────────────────────────────────
const automated = key.cases.filter((c) => c.status !== 'manual');
const mapping = { agree: [], disagree: [] };
for (const k of automated) {
  const b = bob.get(k.id);
  const keyTest = k.test ?? null;
  const bobTest = b?.testName ?? null;
  (keyTest === bobTest ? mapping.agree : mapping.disagree).push({ id: k.id, key: keyTest, bob: bobTest });
}

// ── Test plan: tests in name only ──────────────────────────────────────────
const keyNameOnly = new Set(key.cases.filter((c) => c.status === 'name_only').map((c) => c.id));
const bobNameOnly = new Set([...bob].filter(([, c]) => c.mutationResult === 'NAME_ONLY').map(([id]) => id));
const nameOnly = {
  both: [...keyNameOnly].filter((id) => bobNameOnly.has(id)),
  keyOnly: [...keyNameOnly].filter((id) => !bobNameOnly.has(id)).map((id) => ({ id, bobTest: bob.get(id)?.testName ?? null })),
  bobOnly: [...bobNameOnly].filter((id) => !keyNameOnly.has(id)).map((id) => ({ id, witness: Boolean(bob.get(id)?.witness) })),
};
const unproven = [...bob].filter(([, c]) => ['UNPROVEN', 'WEAK_MUTATION', 'WITNESS_INVALID'].includes(c.mutationResult)).map(([id]) => id);

// ── Spec and checklist ─────────────────────────────────────────────────────
const judged = (kind, idOf, truth, idField) => {
  const rows = claims.filter((c) => c.kind === kind);
  return truth.map((t) => {
    const b = rows.find((c) => idOf(c) === t[idField]);
    const bobFalse = b ? b.verdict === 'FAILS' : null;
    return { id: t[idField], keyTrue: t.true, bobVerdict: b?.verdict ?? 'MISSING', agree: b != null && bobFalse === !t.true };
  });
};
const spec = judged('spec', (c) => /clause:([\d.]+)/.exec(c.source)?.[1], docs.spec, 'clause');
const checklist = judged('checklist', (c) => /(R-\d+)/.exec(c.text)?.[1], docs.checklist, 'item');

const score = {
  testPlan: {
    automated: automated.length,
    mapping: { agree: mapping.agree.length, of: automated.length, disagree: mapping.disagree },
    nameOnly,
    heldBackUnproven: unproven,
  },
  spec: { agree: spec.filter((r) => r.agree).length, of: spec.length, bobFails: spec.filter((r) => r.bobVerdict === 'FAILS').map((r) => r.id), disagree: spec.filter((r) => !r.agree) },
  checklist: { agree: checklist.filter((r) => r.agree).length, of: checklist.length, bobFails: checklist.filter((r) => r.bobVerdict === 'FAILS').map((r) => r.id), disagree: checklist.filter((r) => !r.agree) },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(score, null, 2));
} else {
  const s = score;
  console.log(`Bob's audit of Turnstile, scored against the answer key\n`);
  console.log(`Mapping      ${s.testPlan.mapping.agree} of ${s.testPlan.mapping.of} automated cases agree with the key`);
  for (const d of s.testPlan.mapping.disagree) console.log(`             ${d.id}: key "${d.key}", Bob "${d.bob}"`);
  console.log(`Name only    in both: ${s.testPlan.nameOnly.both.join(', ') || 'none'}`);
  console.log(`             key only: ${s.testPlan.nameOnly.keyOnly.map((x) => `${x.id} (Bob: ${x.bobTest ? 'mapped' : 'no test'})`).join(', ') || 'none'}`);
  console.log(`             Bob only: ${s.testPlan.nameOnly.bobOnly.map((x) => `${x.id}${x.witness ? ' (with witness)' : ''}`).join(', ') || 'none'}`);
  console.log(`Spec         ${s.spec.agree} of ${s.spec.of} clauses agree; Bob says false: ${s.spec.bobFails.join(', ')}`);
  console.log(`Checklist    ${s.checklist.agree} of ${s.checklist.of} items agree; Bob says false: ${s.checklist.bobFails.join(', ')}`);
  for (const d of [...s.spec.disagree, ...s.checklist.disagree]) console.log(`             ${d.id}: key ${d.keyTrue ? 'true' : 'false'}, Bob ${d.bobVerdict}`);
}
