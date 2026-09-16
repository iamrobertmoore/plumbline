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
    return L.join('\n');
  }

  L.push('## What a reviewer would see first');
  L.push('');
  L.push('| severity | what it claims | what is true |');
  L.push('|---|---|---|');
  for (const r of a.results.filter((x) => !x.ok)) {
    L.push(`| ${LABEL[r.severity]} | ${String(r.claim).replace(/\|/g, '\\|')} | ${String(r.detail).replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## Everything checked');
  L.push('');
  for (const r of a.results) {
    L.push(`- ${r.ok ? 'ok' : '**fails**'} \`${r.check}\` — ${r.detail}`);
  }
  return L.join('\n');
}

export function renderJson(a, sc) {
  return JSON.stringify({ ...a, selfcheck: sc || null, generated: new Date().toISOString() }, null, 2);
}
