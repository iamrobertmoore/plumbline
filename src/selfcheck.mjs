// selfcheck — negative controls.
//
// For every registered check, build an input that MUST fail and run the check
// against it. A check that returns ok against its own negative control is not
// proving anything, and is reported as UNPROVEN.
//
// This is the feature that makes the tool more than a pile of linters, and it
// comes from the most expensive mistake I have made in CI: a green tick can mean
// nothing. Verify what a check asserts, then prove the check can fail.

import { CHECKS, SEVERITY } from './plumbline.mjs';

const SAMPLES = {
  'link.relative': { id: 'link.relative', kind: 'path', text: 'docs/architecture.md', path: 'README.md' },
  'link.external': { id: 'link.external', kind: 'link', text: 'https://example.com', url: 'https://example.com' },
  install: { id: 'install', kind: 'install', text: 'npm install left-pad', pkg: 'left-pad' },
  // The version control needs a package whose registry entry points back at a
  // repository, otherwise the check correctly skips and the control proves nothing.
  // left-pad is stable and its repository field is `stevemao/left-pad`. If that ever
  // changes, this control fails safe: it reports UNPROVEN rather than a false pass.
  'manifest.version': { id: 'manifest.version', kind: 'manifest', text: '1.0.0', name: 'left-pad', version: '1.0.0', repository: 'https://github.com/stevemao/left-pad.git' },
  'license.claimed': { id: 'license.claimed', kind: 'license', text: 'MIT' },
  'ci.claimed': { id: 'ci.claimed', kind: 'ci', text: 'CI runs on every push' },
};

export async function selfcheck(ctx = {}) {
  // The controls are self-contained: each one builds its own failing input. Two of
  // them derive that input from the context, though, so the context needs safe
  // defaults rather than assuming the caller passed one. `selfcheck()` with no
  // arguments is a supported call, and it must not throw.
  const base = { root: process.cwd(), rootFiles: [], workflowFiles: [], ...ctx };
  const out = [];
  for (const [id, check] of Object.entries(CHECKS)) {
    const sample = SAMPLES[id];
    if (!sample) {
      out.push({ id, title: check.title, severity: check.severity, proven: false, reason: 'no negative control defined' });
      continue;
    }
    const hasControl = typeof check.mutate === 'function' || typeof check.mutateCtx === 'function';
    if (!hasControl) {
      out.push({ id, title: check.title, severity: check.severity, proven: false, reason: 'no negative control defined' });
      continue;
    }
    const badClaim = typeof check.mutate === 'function' ? check.mutate(sample, base) : sample;
    const badCtx = typeof check.mutateCtx === 'function' ? check.mutateCtx(base) : base;
    let r;
    try { r = await check.run(badCtx, badClaim); }
    catch (e) { r = { ok: false, detail: `threw: ${e.message}` }; }
    out.push({
      id, title: check.title, severity: check.severity,
      proven: r.ok !== true,
      detail: r.detail,
    });
  }
  const unproven = out.filter((c) => !c.proven);
  return {
    total: out.length,
    proven: out.length - unproven.length,
    unproven: unproven.length,
    verdict: unproven.length === 0 ? 'PROVEN' : 'INCOMPLETE',
    controls: out,
  };
}

export function renderSelfcheck(sc) {
  const L = [];
  L.push('# Negative controls');
  L.push('');
  L.push('Every check is run against an input that must fail it. A check that passes its own');
  L.push('negative control proves nothing, and is reported as UNPROVEN rather than PASS.');
  L.push('');
  L.push(`**${sc.proven}/${sc.total} checks proved able to fail.** Result: \`${sc.verdict}\`.`);
  L.push('');
  L.push('| check | what it asserts | can fail | evidence |');
  L.push('|---|---|---|---|');
  for (const c of sc.controls) {
    L.push(`| \`${c.id}\` | ${c.title} | ${c.proven ? 'yes' : '**NO**'} | ${(c.detail || c.reason || '').replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  if (sc.unproven) {
    L.push(`> **${sc.unproven} check(s) could not be made to fail and are not counted as passing.**`);
    L.push('');
  }
  return L.join('\n');
}
