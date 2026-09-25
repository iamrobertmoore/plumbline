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
  const sc = await selfcheck();
  assert.equal(sc.total, Object.keys(CHECKS).length);
  const unproven = sc.controls.filter((c) => !c.proven).map((c) => `${c.id}: ${c.detail || c.reason}`);
  assert.deepEqual(unproven, [], 'these checks passed their own negative control, which proves nothing');
});

test('the selfcheck verdict is PROVEN when every check can fail', async (t) => {
  if (!await online()) return t.skip('offline');
  const sc = await selfcheck();
  assert.equal(sc.unproven, 0);
  assert.equal(sc.verdict, 'PROVEN');
});

test('the rendered selfcheck states the count and does not hide an unproven check', async (t) => {
  if (!await online()) return t.skip('offline');
  const sc = await selfcheck();
  const md = renderSelfcheck(sc);
  assert.match(md, new RegExp(`${sc.proven}/${sc.total}`));
  assert.match(md, /PROVEN/);
  for (const c of sc.controls) assert.match(md, new RegExp(c.id.replace('.', '\\.')));
});

test('a check that cannot fail is reported unproven, never as a pass', async (t) => {
  if (!await online()) return t.skip('offline');
  // A check whose negative control is a no-op must be caught by the harness. The
  // good half of the control has to be accepted, or the control is not being tested
  // at all.
  const original = CHECKS['ci.claimed'].mutateCtx;
  CHECKS['ci.claimed'].mutateCtx = (ctx) => ctx; // deliberately useless control
  try {
    const sc = await selfcheck();
    const ci = sc.controls.find((c) => c.id === 'ci.claimed');
    assert.equal(ci.proven, false, 'a no-op control must not count as proven');
    assert.equal(sc.verdict, 'INCOMPLETE');
  } finally { CHECKS['ci.claimed'].mutateCtx = original; }
});

test('a no-op mutation is caught on every context-derived control', async (t) => {
  if (!await online()) return t.skip('offline');
  // Regression: the CLI used to hand these controls an empty file list, so
  // license.claimed and ci.claimed failed on the good input too, and deleting their
  // mutations entirely still printed 6/6 PROVEN. Both halves are pinned now.
  for (const id of ['license.claimed', 'ci.claimed', 'manifest.version']) {
    const original = { ...CHECKS[id] };
    CHECKS[id].mutateCtx = (ctx) => ctx;
    CHECKS[id].mutate = (claim) => claim;
    try {
      const sc = await selfcheck();
      const c = sc.controls.find((x) => x.id === id);
      assert.equal(c.acceptsGoodInput, true, `${id}: the good input must be accepted`);
      assert.equal(c.proven, false, `${id}: a no-op mutation must not count as proven`);
      assert.equal(sc.verdict, 'INCOMPLETE');
    } finally { Object.assign(CHECKS[id], original); }
  }
});

test('a check that never fails is caught, not counted', async (t) => {
  if (!await online()) return t.skip('offline');
  const original = CHECKS['link.relative'].run;
  CHECKS['link.relative'].run = async () => ({ ok: true, detail: 'always ok' });
  try {
    const sc = await selfcheck();
    assert.equal(sc.controls.find((c) => c.id === 'link.relative').proven, false);
    assert.equal(sc.verdict, 'INCOMPLETE');
  } finally { CHECKS['link.relative'].run = original; }
});

test('a check that fails on its good input is caught, not counted', async (t) => {
  if (!await online()) return t.skip('offline');
  // The mirror image, and the one that actually bit: a check that rejects everything
  // "fails" its control for a reason that has nothing to do with the mutation.
  const original = CHECKS['link.external'].run;
  CHECKS['link.external'].run = async () => ({ ok: false, detail: 'always fails' });
  try {
    const sc = await selfcheck();
    const c = sc.controls.find((x) => x.id === 'link.external');
    assert.equal(c.acceptsGoodInput, false);
    assert.equal(c.proven, false);
    assert.equal(sc.verdict, 'INCOMPLETE');
  } finally { CHECKS['link.external'].run = original; }
});

test('a blocker-severity failure produces FAIL, not WARN', async (t) => {
  if (!await online()) return t.skip('offline');
  const root = mkdtempSync(join(tmpdir(), 'plumbline-'));
  try {
    // left-pad has never published 9.9.9, and its registry entry points back at
    // stevemao/left-pad, so the comparison is allowed to happen. (This test used 0.0.0
    // until 25 September, when the check changed from "is it the latest" to "is it
    // published": left-pad did publish 0.0.0, so the old test was asserting a false
    // accusation.)
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'left-pad',
      version: '9.9.9',
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
