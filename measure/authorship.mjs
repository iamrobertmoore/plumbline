// authorship.mjs — the second measurement.
//
// The headline figure is how many of the corpus misdescribe themselves. This is the
// companion question: how much of the code in those same repositories is now written
// by an agent, and how much of it carries any provenance.
//
// Why this and not a cited statistic. Every published figure for "the share of code
// written by AI" is a content-marketing number: they range from 25% to 75% across
// sources, none of them publishes a method, and none can be checked. A number I
// measured on a corpus I can hand over is worth more than a number I cited, even if
// it is smaller and less flattering.
//
// Method: take the 100 most recent commits on the default branch of each repository
// in corpus.json, and count the ones whose message carries a co-author trailer naming
// a coding agent, or an author account that is an agent bot. That is a LOWER BOUND on
// agent involvement and it is deliberately the strict test: a trailer is a positive
// declaration. Commits that were agent-assisted without saying so are invisible to
// this, and are counted as human.
//
//   GH_TOKEN=$(gh auth token) node measure/authorship.mjs
//   GH_TOKEN=$(gh auth token) node measure/authorship.mjs --out a.json
//
// Needs network: the GitHub API. Reads only.

import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.GH_TOKEN || '';
const UA = 'plumbline-measure/0.1';
const GH = { 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (TOKEN) GH.Authorization = `Bearer ${TOKEN}`;

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const OUT = arg('--out', null);
const PER_PAGE = Number(arg('--per-page', 100));

// The trailer, or the author account, has to name a coding agent. Kept as one list so the
// rule is auditable: every pattern here is a claim that this string identifies a coding
// agent and nothing else.
//
// Two things are deliberately NOT here, and both would have inflated the figure:
//
//   - A bare `[bot]` author. Dependabot, Renovate and github-actions all end in `[bot]`,
//     and none of them writes code. Counting them would have made "agent-authored" mean
//     "a robot touched a lockfile". Only named coding agents are listed.
//   - A bare `bob`. It is a common human first name, so the pattern would have caught
//     people. IBM Bob's own trailer string is not yet known, because the tool is not
//     available until 25 September. It gets added once it is observed, not guessed at.
export const AGENT_PATTERNS = [
  { re: /co-authored-by:\s*.*copilot/i, agent: 'GitHub Copilot' },
  { re: /co-authored-by:\s*.*claude/i, agent: 'Claude' },
  { re: /co-authored-by:\s*.*cursor/i, agent: 'Cursor' },
  { re: /co-authored-by:\s*.*devin/i, agent: 'Devin' },
  { re: /co-authored-by:\s*.*(codex|openai)/i, agent: 'Codex' },
  { re: /co-authored-by:\s*.*(jules|gemini)/i, agent: 'Gemini' },
  { re: /co-authored-by:\s*.*(openhands|aider|sweep|windsurf|cline|roo)/i, agent: 'other agent' },
  { re: /co-authored-by:\s*.*(amazon q|kiro)/i, agent: 'Amazon Q' },
  // An author account that is a named coding agent, with no trailer needed.
  {
    re: /^author:(copilot-swe-agent|devin-ai-integration|google-labs-jules|openhands-agent|cursor|claude|codex|sweep-ai|amazon-q-developer)\[bot\]$/im,
    agent: 'agent bot author',
  },
  { re: /generated-by:\s*\S+/i, agent: 'generated-by trailer' },
];

export function classify(message, authorLogin) {
  const hay = String(message || '') + '\n' + (authorLogin ? `author:${authorLogin}` : '');
  const hits = [];
  for (const p of AGENT_PATTERNS) if (p.re.test(hay)) hits.push(p.agent);
  return [...new Set(hits)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function commits(full) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(
      `https://api.github.com/repos/${full}/commits?per_page=${PER_PAGE}`,
      { signal: c.signal, headers: GH, redirect: 'follow' },
    );
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const j = await r.json();
    if (!Array.isArray(j)) return { error: 'unexpected payload' };
    return { commits: j };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  } finally { clearTimeout(t); }
}

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
if (!TOKEN) console.error('warning: no GH_TOKEN, GitHub will rate-limit this run and the result will be wrong');

const rows = [];
const t0 = Date.now();
for (let i = 0; i < corpus.length; i++) {
  const repo = corpus[i];
  const res = await commits(repo.full_name);
  if (res.error) {
    rows.push({ repo: repo.full_name, error: res.error, sampled: 0, agent: 0 });
    console.log(`${String(i + 1).padStart(3)}/${corpus.length} ${repo.full_name.padEnd(46)} ERROR ${res.error}`);
  } else {
    let agent = 0;
    const agents = new Map();
    for (const c of res.commits) {
      const login = c.author && c.author.login;
      const hits = classify(c.commit && c.commit.message, login);
      if (hits.length) {
        agent += 1;
        for (const h of hits) agents.set(h, (agents.get(h) || 0) + 1);
      }
    }
    rows.push({ repo: repo.full_name, sampled: res.commits.length, agent, agents: Object.fromEntries(agents) });
    console.log(`${String(i + 1).padStart(3)}/${corpus.length} ${repo.full_name.padEnd(46)} agent=${agent}/${res.commits.length}`);
  }
  await sleep(60);
}

const ok = rows.filter((r) => !r.error);
const sampled = ok.reduce((a, r) => a + r.sampled, 0);
const agentCommits = ok.reduce((a, r) => a + r.agent, 0);
const reposWith = ok.filter((r) => r.agent > 0);
const byAgent = {};
for (const r of ok) for (const [k, v] of Object.entries(r.agents || {})) byAgent[k] = (byAgent[k] || 0) + v;

console.log('\n--- totals ---');
console.log('repositories sampled       ', ok.length, rows.length !== ok.length ? `(${rows.length - ok.length} errored)` : '');
console.log('commits sampled            ', sampled);
console.log('commits declaring an agent ', agentCommits, `(${(100 * agentCommits / sampled).toFixed(1)}%)`);
console.log('repositories with >=1       ', reposWith.length, `(${(100 * reposWith.length / ok.length).toFixed(0)}%)`);
console.log('wall clock                 ', ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log('\n--- by agent ---');
for (const [k, v] of Object.entries(byAgent).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
console.log('\n--- the repositories with the most ---');
for (const r of [...reposWith].sort((a, b) => b.agent - a.agent).slice(0, 15)) {
  console.log(`${String(r.agent).padStart(3)}/${String(r.sampled).padEnd(4)} ${r.repo}  ${Object.keys(r.agents).join(', ')}`);
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), perPage: PER_PAGE, sampled, agentCommits, reposWith: reposWith.length, byAgent, rows }, null, 1));
  console.log('\nwrote', OUT);
}
