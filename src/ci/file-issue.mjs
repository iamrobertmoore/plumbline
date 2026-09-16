// file-issue — open or update the tracking issue when an audit fails.
//
// Called from CI on the audit step's own outcome, never on `if: failure()`.
// That distinction has cost me a public repo with a false alarm on its front
// page, filed by a workflow that could not tell which step had broken.

import { readFileSync } from 'node:fs';

const reportPath = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : 'out/report.json';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GH_TOKEN are required');
  process.exit(0);
}

const r = JSON.parse(readFileSync(reportPath, 'utf8'));
const failed = r.results.filter((x) => !x.ok);
if (!failed.length) {
  console.error('nothing failed, no issue to file');
  process.exit(0);
}

const TITLE = 'plumbline: this repository does not currently do what it says it does';

const body = [
  'The audit failed. This issue is filed on the audit step\'s own outcome, so it cannot be triggered by an unrelated failure.',
  '',
  `**Verdict:** \`${r.verdict}\` (${r.failures} of ${r.checked} claims do not hold)`,
  '',
  '| severity | what it claims | what is true |',
  '|---|---|---|',
  ...failed.map((x) => `| ${x.severity} | ${x.claim} | ${x.detail} |`),
  '',
  `Run: ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`,
].join('\n');

const api = `https://api.github.com/repos/${repo}/issues`;
const H = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'plumbline',
  'Content-Type': 'application/json',
};

const open = await (await fetch(`${api}?state=open&per_page=100`, { headers: H })).json();
const existing = Array.isArray(open) ? open.find((i) => i.title === TITLE) : null;

if (existing) {
  const res = await fetch(`${api}/${existing.number}/comments`, { method: 'POST', headers: H, body: JSON.stringify({ body }) });
  console.error(res.ok ? `updated issue #${existing.number}` : `failed to comment: ${res.status}`);
} else {
  const res = await fetch(api, { method: 'POST', headers: H, body: JSON.stringify({ title: TITLE, body }) });
  console.error(res.ok ? 'opened issue' : `failed to open issue: ${res.status}`);
}
