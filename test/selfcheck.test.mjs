// The negative controls, plus the one verdict path that needs a real registry.
//
// These reach the network (the npm registry and a deliberately unresolvable
// hostname), so each one skips rather than fails when the machine is offline.
// A test that fails because the wifi is down teaches nobody anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECKS, audit } from '../src/plumbline.mjs';
import { selfcheck, renderSelfcheck } from '../src/selfcheck.mjs';

async function online() {
  try {
    const r = await fetch('https://registry.npmjs.org/left-pad', { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

test('every registered check is exercised by a negative control', async (t) => {
  if (!await online()) return t.skip('offline');
  const sc = await selfcheck({});
  assert.equal(sc.total, Object.keys(CHECKS).length);
  const unproven = sc.controls.filter((c) => !c.proven).map((c) => `${c.id}: ${c.detail || c.reason}`);
  assert.deepEqual(unproven, [], 'these checks passed their own negative control, which proves nothing');
});

test('the selfcheck verdict is PROVEN when every check can fail', async (t) => {
  if (!await online()) return t.skip('offline');
  const sc = await selfcheck({});
  assert.equal(sc.unproven, 0);
  assert.equal(sc.verdict, 'PROVEN');
});

test('the rendered selfcheck states the count and does not hide an unproven check', async (t) => {
  if (!await online()) return t.skip('offline');
  const sc = await selfcheck({});
  const md = renderSelfcheck(sc);
  assert.match(md, new RegExp(`${sc.proven}/${sc.total}`));
  assert.match(md, /PROVEN/);
  for (const c of sc.controls) assert.match(md, new RegExp(c.id.replace('.', '\\.')));
});

test('a check that cannot fail is reported unproven, never as a pass', async (t) => {
  if (!await online()) return t.skip('offline');
  // A check whose negative control is a no-op must be caught by the harness. The
  // context has to be one where the check would otherwise pass, or the control is
  // not being tested at all.
  const original = CHECKS['ci.claimed'].mutateCtx;
  CHECKS['ci.claimed'].mutateCtx = (ctx) => ctx; // deliberately useless control
  try {
    const sc = await selfcheck({ workflowFiles: ['ci.yml'] });
    const ci = sc.controls.find((c) => c.id === 'ci.claimed');
    assert.equal(ci.proven, false, 'a no-op control must not count as proven');
    assert.equal(sc.verdict, 'INCOMPLETE');
  } finally { CHECKS['ci.claimed'].mutateCtx = original; }
});

test('a blocker-severity failure produces FAIL, not WARN', async (t) => {
  if (!await online()) return t.skip('offline');
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  try {
    // left-pad is published at a version that is not 0.0.0, and its registry entry
    // points back at stevemao/left-pad, so the comparison is allowed to happen.
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'left-pad',
      version: '0.0.0',
      repository: 'https://github.com/stevemao/left-pad.git',
    }));
    const a = await audit({ root });
    assert.equal(a.verdict, 'FAIL', JSON.stringify(a.results, null, 2));
    assert.ok(a.results.some((r) => r.check === 'manifest.version' && !r.ok));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a name collision with a different project is not an accusation', async (t) => {
  if (!await online()) return t.skip('offline');
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  try {
    // "plumbline" on npm belongs to an unrelated Angular testing utility. A repo
    // that happens to share the name must not be told its version is wrong.
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'plumbline',
      version: '0.1.0',
      repository: 'https://github.com/iamrobertmoore/plumbline.git',
    }));
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
    assert.equal(a.verdict, 'PASS');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a private workspace manifest is never compared to a registry', async (t) => {
  if (!await online()) return t.skip('offline');
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'left-pad',
      version: '0.0.0',
      private: true,
      repository: 'https://github.com/stevemao/left-pad.git',
    }));
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a manifest whose package is not on npm is skipped, not accused', async (t) => {
  if (!await online()) return t.skip('offline');
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'plumbline-no-such-package-xyz', version: '1.0.0' }));
    const a = await audit({ root });
    assert.equal(a.failures, 0, JSON.stringify(a.results, null, 2));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
