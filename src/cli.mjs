#!/usr/bin/env node
// plumbline CLI.
//
//   plumbline --repo .                       audit the repository in the cwd
//   plumbline --selfcheck                    prove every check can fail
//   plumbline --repo . --format json --out r.json --format markdown --out r.md

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { audit } from './plumbline.mjs';
import { selfcheck, renderSelfcheck } from './selfcheck.mjs';
import { renderMarkdown, renderJson } from './report.mjs';

function parse(argv) {
  const o = { repo: '.', format: [], out: [], selfcheck: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--format') o.format.push(argv[++i]);
    else if (a === '--out') o.out.push(argv[++i]);
    else if (a === '--selfcheck') o.selfcheck = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

const o = parse(process.argv.slice(2));
if (o.help) {
  console.log('plumbline --repo <dir> [--selfcheck] [--format markdown|json --out <file>]');
  process.exit(0);
}

const root = resolve(o.repo);
// The controls build their own workspace. Handing them the audited repository's
// context is what made two of them degenerate: they failed on an empty file list
// before the mutation was ever applied.
const sc = o.selfcheck ? await selfcheck() : null;
const a = await audit({ root });

const payloads = [];
if (!o.format.length) o.format.push('markdown');
for (const f of o.format) {
  const body = f === 'json' ? renderJson(a, sc) : renderMarkdown(a, sc) + (sc ? '\n\n' + renderSelfcheck(sc) : '');
  payloads.push({ f, body });
}

if (!o.out.length) {
  for (const p of payloads) process.stdout.write(p.body + '\n');
} else {
  for (let i = 0; i < payloads.length; i++) {
    const dest = resolve(o.out[i] || `plumbline.${payloads[i].f === 'json' ? 'json' : 'md'}`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, payloads[i].body);
    if (!o.quiet) console.error(`wrote ${dest}`);
  }
}

// Exit codes: 0 when nothing failed or only warnings did, 1 on a blocker, 2 when a
// check could not be shown to fail. A warning is a note about the repository, not a
// reason to hold a release, so it does not break the build. A check that cannot fail
// the build at all is decoration, which is what exit 2 is for.
if (a.verdict === 'FAIL') process.exit(1);
if (sc && sc.verdict === 'INCOMPLETE') process.exit(2);
process.exit(0);
