#!/usr/bin/env node
// render-report.mjs — self-contained HTML report renderer.
//
// Exports renderReport(claims): string  — pure function, no side-effects.
// When run directly, reads .plumbline/claims.json and writes .plumbline/report.html.
//
// Design: dark theme, IBM Plex fonts (with system fallbacks).
// Accent #e4ad45 (brass), fails #ff6a55 (red), holds #52d6a4 (green).
// Zero external dependencies. Node >= 20.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = process.cwd();

function claimsPath() {
  const primary = join(REPO_ROOT, '.plumbline', 'claims.json');
  if (existsSync(primary)) return primary;
  const fallback = join(REPO_ROOT, 'claims.json');
  if (existsSync(fallback)) return fallback;
  return primary;
}

// ── HTML escaping ──────────────────────────────────────────────────────────

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── row class mapping ──────────────────────────────────────────────────────

function rowClass(claim) {
  if (claim.mutationResult === 'NAME_ONLY') return 'bad';
  if (claim.mutationResult === 'BASELINE_FAIL') return 'warn';
  if (claim.mutationResult === 'MUTATION_INVALID') return 'warn';
  if (claim.mutationResult === 'NO_SUCH_TEST') return 'warn';
  if (claim.verdict === 'FAILS') return 'bad';
  if (claim.verdict === 'UNVERIFIABLE') return 'warn';
  if (claim.verdict === 'PARTIAL') return 'warn';
  if (claim.testFile == null && claim.kind === 'test-plan') return 'warn';
  return 'ok';
}

// ── headline metrics ───────────────────────────────────────────────────────

function headline(claims) {
  const testPlan = claims.filter((c) => c.kind === 'test-plan');
  const automated = testPlan; // all test-plan rows are automated (manual filtered in Stage 1)
  const withTest = automated.filter((c) => c.testFile != null);
  const withoutTest = automated.filter((c) => c.testFile == null);
  const nameOnly = automated.filter((c) => c.mutationResult === 'NAME_ONLY');
  return { testPlan, automated, withTest, withoutTest, nameOnly };
}

// ── main render ────────────────────────────────────────────────────────────

/**
 * Pure function: turns claims array into a self-contained HTML string.
 */
export function renderReport(claims) {
  const h = headline(claims);
  const specClaims = claims.filter((c) => c.kind === 'spec');
  const checklistClaims = claims.filter((c) => c.kind === 'checklist');
  const summarySection = claims.filter((c) => c.kind === 'summary');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface2: #21262d;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #e4ad45;
      --red: #ff6a55;
      --green: #52d6a4;
      --amber: #d9a51f;
      --font: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
      --mono: "IBM Plex Mono", ui-monospace, "Cascadia Code", monospace;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.6;
      padding: 2rem 1rem 4rem;
    }
    .wrap { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; color: var(--accent); margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; font-weight: 600; color: var(--text); margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
    h3 { font-size: 0.95rem; font-weight: 600; color: var(--muted); margin: 1.5rem 0 0.5rem; }
    .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }
    /* Headline tiles */
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 2rem; }
    .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; }
    .tile .val { font-size: 2rem; font-weight: 600; line-height: 1; margin-bottom: 0.25rem; }
    .tile .lbl { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .tile.bad  .val { color: var(--red); }
    .tile.warn .val { color: var(--amber); }
    .tile.ok   .val { color: var(--green); }
    .tile.accent .val { color: var(--accent); }
    /* Tables */
    .tbl-wrap { overflow-x: auto; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: var(--surface2); color: var(--muted); font-weight: 600; text-align: left;
         padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); white-space: nowrap; }
    td { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr.bad  td { background: rgba(255,106,85,0.08); }
    tr.warn td { background: rgba(217,165,31,0.08); }
    tr.ok   td { background: rgba(82,214,164,0.05); }
    .badge { display: inline-block; font-family: var(--mono); font-size: 0.75rem; font-weight: 600;
             padding: 0.1em 0.5em; border-radius: 4px; white-space: nowrap; }
    .badge.caught      { background: rgba(82,214,164,0.15);  color: var(--green); }
    .badge.name-only   { background: rgba(255,106,85,0.2);   color: var(--red);   }
    .badge.baseline    { background: rgba(217,165,31,0.15);  color: var(--amber); }
    .badge.invalid     { background: rgba(217,165,31,0.15);  color: var(--amber); }
    .badge.error       { background: rgba(255,106,85,0.15);  color: var(--red);   }
    .badge.holds       { background: rgba(82,214,164,0.15);  color: var(--green); }
    .badge.fails       { background: rgba(255,106,85,0.2);   color: var(--red);   }
    .badge.partial     { background: rgba(217,165,31,0.15);  color: var(--amber); }
    .badge.unverify    { background: rgba(139,148,158,0.15); color: var(--muted); }
    .badge.unmapped    { background: rgba(217,165,31,0.1);   color: var(--amber); }
    .name-only-label { font-weight: 700; color: var(--red); font-size: 0.8rem; }
    code { font-family: var(--mono); font-size: 0.8rem; background: var(--surface2);
           padding: 0.1em 0.4em; border-radius: 3px; word-break: break-all; }
    .mutation { font-family: var(--mono); font-size: 0.78rem; color: var(--muted); }
    .mutation .del { color: var(--red); }
    .mutation .ins { color: var(--green); }
    .name-only-list { margin: 0 0 1.5rem; padding: 0; list-style: none; }
    .name-only-list li { background: rgba(255,106,85,0.1); border-left: 3px solid var(--red);
                         padding: 0.5rem 0.75rem; margin-bottom: 0.4rem; border-radius: 0 4px 4px 0; }
    .name-only-list li code { background: transparent; }
    footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 3rem;
             padding-top: 1rem; border-top: 1px solid var(--border); }
  `.trim();

  // Inline the font import as a proper stylesheet link (no external fetch needed
  // for self-contained display; system fonts are the fallback).
  // We keep the @import in a separate non-blocked style to avoid CSP issues.

  function mutationBadge(claim) {
    const r = claim.mutationResult;
    if (!r) return '';
    const map = {
      CAUGHT: ['caught', 'CAUGHT'],
      NAME_ONLY: ['name-only', 'NAME ONLY'],
      BASELINE_FAIL: ['baseline', 'BASELINE FAIL'],
      MUTATION_INVALID: ['invalid', 'INVALID'],
      NO_SUCH_TEST: ['invalid', 'NO SUCH TEST'],
      ERROR: ['error', 'ERROR'],
    };
    const [cls, label] = map[r] ?? ['', r];
    const extra = r === 'NAME_ONLY' ? ' <span class="name-only-label">TEST IN NAME ONLY</span>' : '';
    return `<span class="badge ${cls}">${label}</span>${extra}`;
  }

  function verdictBadge(v) {
    if (!v) return '<span class="badge unverify">—</span>';
    const map = {
      HOLDS: 'holds', FAILS: 'fails', PARTIAL: 'partial', UNVERIFIABLE: 'unverify',
    };
    return `<span class="badge ${map[v] ?? ''}">${esc(v)}</span>`;
  }

  function mutationDiff(m) {
    if (!m) return '—';
    return `<span class="mutation"><span class="del">- ${esc(m.search)}</span><br><span class="ins">+ ${esc(m.replace)}</span></span>`;
  }

  // ── Test-plan coverage table ─────────────────────────────────────────────

  const tpRows = h.testPlan.map((c) => {
    const cls = rowClass(c);
    const testCell = c.testFile
      ? `<code>${esc(c.testFile)}</code><br><span style="color:var(--muted)">${esc(c.testName)}</span>`
      : '<span class="badge unmapped">UNMAPPED</span>';
    return `<tr class="${cls}">
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.text)}</td>
      <td>${testCell}</td>
      <td>${mutationDiff(c.mutation)}</td>
      <td>${mutationBadge(c)}</td>
    </tr>`;
  }).join('\n');

  // ── Spec verdicts table ──────────────────────────────────────────────────

  const spRows = specClaims.map((c) => {
    const cls = rowClass(c);
    return `<tr class="${cls}">
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.text)}</td>
      <td>${verdictBadge(c.verdict)}</td>
      <td>${esc(c.verdictDetail)}</td>
    </tr>`;
  }).join('\n');

  // ── Checklist verdicts table ─────────────────────────────────────────────

  const clRows = checklistClaims.map((c) => {
    const cls = rowClass(c);
    return `<tr class="${cls}">
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.text)}</td>
      <td>${verdictBadge(c.verdict)}</td>
      <td>${esc(c.verdictDetail)}</td>
    </tr>`;
  }).join('\n');

  // ── Summary claims ───────────────────────────────────────────────────────

  const summaryRows = summarySection.map((c) => {
    const cls = rowClass(c);
    return `<tr class="${cls}">
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.source)}</td>
      <td>${esc(c.text)}</td>
      <td>${verdictBadge(c.verdict)}</td>
      <td>${esc(c.verdictDetail)}</td>
    </tr>`;
  }).join('\n');

  // ── NAME_ONLY call-out list ──────────────────────────────────────────────

  const nameOnlyItems = h.nameOnly.map((c) =>
    `<li><strong><code>${esc(c.id)}</code></strong> — ${esc(c.text)}<br>` +
    `<span class="mutation">Mutation: <span class="del">${esc(c.mutation?.search)}</span> → <span class="ins">${esc(c.mutation?.replace)}</span></span></li>`
  ).join('\n');

  const nameOnlySection = h.nameOnly.length > 0 ? `
    <h2>⚠ Tests in name only (${h.nameOnly.length})</h2>
    <p style="color:var(--muted);margin-bottom:0.75rem">
      These tests did not detect their own mutation. They assert a name but not the behaviour.
    </p>
    <ul class="name-only-list">${nameOnlyItems}</ul>
  ` : '';

  // ── Tiles ────────────────────────────────────────────────────────────────

  const tiles = [
    { val: h.testPlan.length,    lbl: 'Cases in plan',    cls: 'accent' },
    { val: h.automated.length,   lbl: 'Automated',        cls: 'accent' },
    { val: h.withTest.length,    lbl: 'With a test',      cls: h.withTest.length === h.automated.length ? 'ok' : 'warn' },
    { val: h.withoutTest.length, lbl: 'Without a test',   cls: h.withoutTest.length > 0 ? 'warn' : 'ok' },
    { val: h.nameOnly.length,    lbl: 'Tests in name only', cls: h.nameOnly.length > 0 ? 'bad' : 'ok' },
  ].map(({ val, lbl, cls }) =>
    `<div class="tile ${cls}"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`
  ).join('\n');

  const generated = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plumbline Report</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">

<h1>Plumbline Report</h1>
<p class="subtitle">Generated ${generated}</p>

<h2>Test-plan headline</h2>
<div class="tiles">${tiles}</div>

${nameOnlySection}

${h.testPlan.length > 0 ? `
<h2>Test-plan coverage (${h.testPlan.length} cases)</h2>
<div class="tbl-wrap">
<table>
<thead><tr><th>ID</th><th>Claim</th><th>Test</th><th>Mutation</th><th>Result</th></tr></thead>
<tbody>${tpRows}</tbody>
</table>
</div>
` : ''}

${specClaims.length > 0 ? `
<h2>Spec verdicts (${specClaims.length})</h2>
<div class="tbl-wrap">
<table>
<thead><tr><th>ID</th><th>Clause</th><th>Verdict</th><th>Detail</th></tr></thead>
<tbody>${spRows}</tbody>
</table>
</div>
` : ''}

${checklistClaims.length > 0 ? `
<h2>Checklist verdicts (${checklistClaims.length})</h2>
<div class="tbl-wrap">
<table>
<thead><tr><th>ID</th><th>Item</th><th>Verdict</th><th>Detail</th></tr></thead>
<tbody>${clRows}</tbody>
</table>
</div>
` : ''}

${summarySection.length > 0 ? `
<h2>Workbook summary claims (${summarySection.length})</h2>
<div class="tbl-wrap">
<table>
<thead><tr><th>ID</th><th>Source</th><th>Claim</th><th>Verdict</th><th>Detail</th></tr></thead>
<tbody>${summaryRows}</tbody>
</table>
</div>
` : ''}

</div>
<footer>Made with IBM Bob</footer>
</body>
</html>`;
}

// ── script mode ────────────────────────────────────────────────────────────

if (process.argv[1] === __filename) {
  const cp = claimsPath();
  if (!existsSync(cp)) {
    console.error(`render-report: claims file not found at ${cp}`);
    process.exit(1);
  }
  const claims = JSON.parse(readFileSync(cp, 'utf8'));
  const html = renderReport(claims);
  const out = cp.replace('claims.json', 'report.html');
  writeFileSync(out, html, 'utf8');
  console.log(`render-report: wrote ${out}`);
}
