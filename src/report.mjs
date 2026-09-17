// report — output formats.
//
// The report leads with what a reviewer would notice first, not with the order
// the checks happened to run. That ordering is the product: the output is a list
// of the places the project says something that is not true, ranked by visibility.

import { SEVERITY } from './plumbline.mjs';

const LABEL = { 3: 'BLOCKER', 2: 'WARNING', 1: 'NOTE' };

export function renderMarkdown(a, sc) {
  const L = [];
  L.push(`# plumbline report`);
  L.push('');
  L.push(`**Verdict: \`${a.verdict}\`** — ${a.failures} of ${a.checked} claims about this repository do not hold.`);
  L.push('');
  L.push(`- claims read: ${a.claims}`);
  L.push(`- claims checked: ${a.checked}`);
  L.push(`- claims that fail: ${a.failures}`);
  if (a.skipped) L.push(`- claims not observable: ${a.skipped} (counted, not accused)`);
  if (sc) L.push(`- checks proved able to fail: ${sc.proven}/${sc.total}`);
  L.push('');

  if (a.skipped) {
    L.push('Not observable means the tool could not see the thing the claim depends on, so it');
    L.push('says nothing rather than guessing. The reasons:');
    L.push('');
    const byReason = new Map();
    for (const s of a.skippedDetail) byReason.set(s.detail, (byReason.get(s.detail) || 0) + 1);
    for (const [reason, n] of byReason) L.push(`- ${n} x ${reason}`);
    L.push('');
  }

  if (!a.failures) {
    L.push('Nothing in this repository currently contradicts itself.');
    L.push('');
    L.push('> A pass only means something if the check could have failed. See the negative controls below.');
    L.push('');
  }

  // The ledger. Every claim, what it asserts, and the evidence, in one grid, with the
  // failures at the top. A reader should be able to run their eye down the first column
  // and know the state of the repository without reading a sentence of prose.
  //
  // This is deliberately one table and not two. An earlier version split the failures
  // into a ranked summary and left the passes as a bullet list, which meant the two
  // halves were ranked by different rules and a reader could not see the whole set at
  // once. The whole set is the point.
  L.push('## Every claim, and what happened to it');
  L.push('');
  L.push('| verdict | claim | what it asserts | evidence |');
  L.push('|---|---|---|---|');
  const esc = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|');
  const ordered = [
    ...a.results.filter((r) => !r.ok).sort((x, y) => (y.severity || 0) - (x.severity || 0)),
    ...a.results.filter((r) => r.ok),
    ...(a.skippedDetail || []).map((s) => ({ ...s, ok: null, skipped: true })),
  ];
  for (const r of ordered) {
    const v = r.skipped ? 'not observable' : r.ok ? 'holds' : LABEL[r.severity] || 'fails';
    L.push(`| ${v} | \`${r.check}\` | ${esc(r.claim)} | ${esc(r.detail)} |`);
  }
  L.push('');
  if (a.failures) {
    L.push(`${a.failures} of these do not hold. The rows above are ordered by what a reader`);
    L.push('would hit first, not by the order the checks happened to run.');
    L.push('');
  }
  return L.join('\n');
}

export function renderJson(a, sc) {
  return JSON.stringify({ ...a, selfcheck: sc || null, generated: new Date().toISOString() }, null, 2);
}
