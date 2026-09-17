// selfcheck — negative controls.
//
// For every registered check, build one input the check must ACCEPT and one it must
// REJECT, then run both. A check is only proven if it passes the good input and fails
// the mutated one.
//
// The good input is half the control, and it is the half that is easy to skip. If a
// check already fails on a good input, deleting the mutation does not change the
// result, so the control would report "proven" for a check that cannot tell the two
// apart. That is a green tick that means nothing, which is the exact failure this
// whole tool exists to catch. A control that cannot distinguish is reported UNPROVEN.
//
// The controls build their own workspace rather than borrowing the repository being
// audited. A control that depends on the caller's context stops proving anything the
// moment the caller passes an empty one.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECKS, npmLatest } from './plumbline.mjs';

async function run(check, ctx, claim) {
  try { return await check.run(ctx, claim); }
  catch (e) { return { ok: false, detail: `threw: ${e.message}` }; }
}

// A real directory with real files, so the path-based checks have something to
// point at that does not depend on where the tool was run from.
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'plumbline-selfcheck-'));
  writeFileSync(join(dir, 'README.md'), '# control\n');
  writeFileSync(join(dir, 'LICENSE'), 'MIT\n');
  return dir;
}

// The input each check must accept. These are built, not assumed.
async function positives(root) {
  // The manifest control needs a version that is genuinely current, otherwise the
  // good input fails the check for an honest reason and the control proves nothing.
  // If the registry is unreachable this stays unproven, which is the correct
  // outcome: an unverifiable control must never read as a pass.
  const info = await npmLatest('left-pad');
  const latest = info && info.latest ? info.latest : null;

  return {
    'link.relative': {
      ctx: { root, rootFiles: ['README.md'] },
      claim: { id: 'link.relative', kind: 'path', text: 'README.md', path: 'README.md' },
    },
    'link.external': {
      ctx: { root },
      claim: { id: 'link.external', kind: 'link', text: 'https://example.com', url: 'https://example.com' },
    },
    install: {
      ctx: { root },
      claim: { id: 'install', kind: 'install', text: 'npm install left-pad', pkg: 'left-pad' },
    },
    'manifest.version': {
      ctx: { root },
      claim: {
        id: 'manifest.version', kind: 'manifest', text: latest || '1.0.0',
        name: 'left-pad', version: latest || '1.0.0',
        repository: 'https://github.com/stevemao/left-pad.git',
      },
    },
    'license.claimed': {
      ctx: { root, rootFiles: ['LICENSE'], githubLicense: 'MIT' },
      claim: { id: 'license.claimed', kind: 'license', text: 'MIT' },
    },
    'ci.claimed': {
      ctx: { root, workflowFiles: ['ci.yml'] },
      claim: { id: 'ci.claimed', kind: 'ci', text: 'CI runs on every push' },
    },
  };
}

export async function selfcheck() {
  const dir = workspace();
  const good = await positives(dir);
  const out = [];
  try {
    for (const [id, check] of Object.entries(CHECKS)) {
      const pos = good[id];
      const hasControl = typeof check.mutate === 'function' || typeof check.mutateCtx === 'function';
      if (!pos || !hasControl) {
        out.push({ id, title: check.title, severity: check.severity, proven: false, reason: 'no negative control defined' });
        continue;
      }

      const accepted = await run(check, pos.ctx, pos.claim);
      const badClaim = typeof check.mutate === 'function' ? check.mutate(pos.claim, pos.ctx) : pos.claim;
      const badCtx = typeof check.mutateCtx === 'function' ? check.mutateCtx(pos.ctx) : pos.ctx;
      const rejected = await run(check, badCtx, badClaim);

      const proven = accepted.ok === true && rejected.ok !== true;
      out.push({
        id, title: check.title, severity: check.severity,
        proven,
        // Kept separate so a reader can see which half of the control failed.
        acceptsGoodInput: accepted.ok === true,
        rejectsControl: rejected.ok !== true,
        detail: rejected.detail,
        reason: proven ? undefined
          : accepted.ok !== true
            ? 'the check does not accept a good input, so removing the mutation would not change the result'
            : 'the check accepts its own negative control',
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
  L.push('Every check is run against an input it must accept and an input it must reject.');
  L.push('A check that cannot tell those two apart proves nothing, and is reported as');
  L.push('UNPROVEN rather than PASS.');
  L.push('');
  L.push(`**${sc.proven}/${sc.total} checks proved able to fail.** Result: \`${sc.verdict}\`.`);
  L.push('');
  L.push('| check | what it asserts | accepts a good input | rejects the control | evidence |');
  L.push('|---|---|---|---|---|');
  for (const c of sc.controls) {
    const yes = (v) => (v === undefined ? 'n/a' : v ? 'yes' : '**NO**');
    L.push(`| \`${c.id}\` | ${c.title} | ${yes(c.acceptsGoodInput)} | ${yes(c.rejectsControl)} | ${(c.proven ? c.detail : c.reason || c.detail || '').replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  if (sc.unproven) {
    L.push(`> **${sc.unproven} check(s) could not be shown to fail and are not counted as passing.**`);
    L.push('');
  }
  return L.join('\n');
}
