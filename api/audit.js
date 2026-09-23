// GET /api/audit?repo=owner/name
//
// The hosted half of Plumbline's free tier: the deterministic checks, run against any
// public GitHub repository, with nothing to install. It runs the same code as the
// measurement behind the headline number (measure/remote.mjs), so the page and the
// number cannot disagree. It needs no IBM Bob, and it says so on the page.
//
// Bounds, all of them reported in the response rather than hidden:
//   - at most LINK_CAP external links are tested per request; the rest are counted as untested
//   - links to private or loopback addresses are refused and counted
//   - the whole run is abandoned after DEADLINE_MS rather than returning half an answer as a pass

import { createRemoteAuditor } from '../measure/remote.mjs';
import { parseRepo, publicUrl, createLimiter } from './_guard.mjs';

const LINK_CAP = 150;
const DEADLINE_MS = 50_000;
const CACHE_MS = 10 * 60 * 1000;
const MANIFESTS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'pom.xml', 'Gemfile', 'composer.json'];

const limiter = createLimiter();
const cache = new Map();

const json = (status, body, extra = {}) => new Response(JSON.stringify(body, null, 1), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
});

export async function GET(request) {
  const url = new URL(request.url);
  const full = parseRepo(url.searchParams.get('repo'));
  if (!full) return json(400, { error: 'Give a public GitHub repository as owner/name or its github.com URL.' });

  const hit = cache.get(full.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_MS) return json(200, { ...hit.body, cached: true }, { 'cache-control': 'public, s-maxage=600' });

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const gate = limiter(ip);
  if (!gate.ok) return json(429, { error: `Too many audits from one address. Try again in ${gate.retryAfter} seconds.` }, { 'retry-after': String(gate.retryAfter) });

  const token = process.env.GH_TOKEN || '';
  const { auditRepo, req, GH } = createRemoteAuditor({ token, ua: 'plumbline-hosted/0.1', maxLinks: LINK_CAP, concurrency: 16, urlFilter: (u) => publicUrl(u) });

  const t0 = Date.now();
  const meta = await req(`https://api.github.com/repos/${full}`, { headers: GH, timeout: 10000 }).catch(() => null);
  if (!meta || meta.status === 404) return json(404, { error: `${full} is not a public GitHub repository I can see.` });
  if (meta.status === 401) return json(500, { error: `This checker's own GitHub credentials were refused. That is a fault here, not a finding about ${full}.` });
  if (!meta.ok) return json(503, { error: `GitHub did not answer (HTTP ${meta.status}). That says nothing about ${full}; try again shortly.` });
  const m = await meta.json();
  if (m.private) return json(404, { error: `${full} is not a public GitHub repository I can see.` });

  const rootList = await req(`https://api.github.com/repos/${m.full_name}/contents/?ref=${encodeURIComponent(m.default_branch)}`, { headers: GH, timeout: 10000 })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const rootNames = Array.isArray(rootList) ? rootList.map((e) => e.name) : [];
  const repo = {
    full_name: m.full_name,
    stars: m.stargazers_count,
    default_branch: m.default_branch,
    license: (m.license || {}).spdx_id || null,
    manifest: MANIFESTS.find((x) => rootNames.includes(x)) || null,
  };

  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), DEADLINE_MS); });
  let result;
  try {
    result = await Promise.race([auditRepo(repo), deadline]);
  } catch (e) {
    if (String(e.message) === 'deadline') {
      return json(504, { error: `The audit of ${m.full_name} did not finish inside ${DEADLINE_MS / 1000} seconds, so there is no verdict. A partial run is not a pass. The command-line tool has no time limit.` });
    }
    return json(500, { error: `The audit failed: ${e.message}. That is a fault in this checker, not a finding about ${m.full_name}.` });
  } finally { clearTimeout(timer); }

  const body = {
    repo: m.full_name,
    stars: m.stargazers_count,
    branch: m.default_branch,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    bounds: { linkCap: LINK_CAP, deadlineSeconds: DEADLINE_MS / 1000 },
    verdict: result.fails.length ? 'FAILS' : ((result.skipped || []).length || (result.linkStats || {}).unreachable || (result.linkStats || {}).untested ? 'NOT FULLY TESTED' : 'HOLDS'),
    ...result,
  };
  cache.set(full.toLowerCase(), { at: Date.now(), body });
  return json(200, body, { 'cache-control': 'public, s-maxage=600' });
}
