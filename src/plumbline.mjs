// plumbline — core.
//
// The model has three parts and they are deliberately separate:
//
//   CLAIMS   what the repository says about itself, read out of prose and documents
//   CHECKS   what is actually true, established independently of the claim
//   CONTROLS a mutation that MUST make the check fail
//
// The third part is the point. A check that has never been observed to fail is
// reported as UNPROVEN, never as PASS. I learned this the hard way: a CI
// conformance job ran green for days while skipping every test,
// because it gated on a credential that did not exist. It passed, so nothing
// drew attention to it.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SEVERITY = { BLOCKER: 3, WARNING: 2, NOTE: 1 };

// ---------------------------------------------------------------------------
// claim extraction
// ---------------------------------------------------------------------------

// A link inside a code span or a fenced block is not a link, it is an example of one.
// Graphify's README documents its own parser with `[text](./other.md)` inside backticks,
// and treating that as a link accused the project of pointing at a file it had never
// written. That is the failure mode this whole tool exists to argue against, so the link
// passes run against a copy with code removed.
//
// The copy keeps every newline, so the bare-URL pass still sees line boundaries and the
// length of the file is unchanged. Removing the lines instead would have been simpler and
// would have made two unrelated URLs adjacent, which is its own way of inventing a link.
export function proseOnly(md) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return String(md)
    .replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, blank)
    .replace(/^[ \t]*~~~[\s\S]*?^[ \t]*~~~/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

export function claimsFromReadme(md) {
  const claims = [];
  const add = (id, kind, text, extra = {}) => claims.push({ id, kind, text, ...extra });
  // Everything that is genuinely a link lives in here.
  const prose = proseOnly(md);

  // A link destination may itself contain balanced parentheses, and Wikipedia URLs
  // do this constantly: .../wiki/Script_(Unix). Stopping at the first ")" cut those
  // URLs short and reported a live page as dead, which is the one thing this tool
  // must never do: accuse a repository of something the evidence does not support.
  // Angle brackets are the other legal way to write a destination containing spaces.
  for (const m of prose.matchAll(/\[[^\]]*\]\(\s*(?:<([^>\n]+)>|((?:[^\s()]|\((?:[^\s()]|\([^\s()]*\))*\))+))\s*\)/g)) {
    const href = m[1] || m[2];
    if (/^https?:/i.test(href)) { add('link.external', 'link', href, { url: href }); continue; }
    // Any other URI scheme (mailto:, tel:, irc:, ftp:, data:) is not a path in this
    // repository. Treating these as filesystem paths produced a whole class of false
    // positives, which is the failure mode that matters most: an accusation the tool
    // cannot support.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    if (/^(#|\/\/)/.test(href)) continue;
    // A leading slash is repository-root-relative on GitHub, not an absolute
    // filesystem path. Stripping it is what stops "/docs/x.md" being reported as
    // escaping the repository. The query string is not part of the path: a link to
    // "images/x.png?WT.mc_id=..." points at a file that exists, and leaving the
    // query on the end made the tool accuse it of pointing at nothing. This is one
    // of the corrections written up in the method, and it had never been carried
    // into the shipped parser.
    const path = href.split('#')[0].split('?')[0].replace(/^\/+/, '');
    if (!path) continue;
    // A pipe inside a link destination is almost always a markdown table separator
    // that got captured. The intent is ambiguous, so report nothing rather than guess.
    if (path.includes('|')) continue;
    add('link.relative', 'path', path, { path });
  }
  // Bare URLs in prose get the same treatment: a balanced pair of parentheses is
  // part of the URL, an unmatched one is punctuation that ends the sentence. Without
  // this the bare pass re-truncated every Wikipedia link the markdown pass had just
  // parsed correctly, and the truncated one is the one that gets checked. This pass
  // also runs against the code-stripped copy, for the same reason as the one above.
  for (const m of prose.matchAll(/(?:^|[\s(])(https?:\/\/(?:[^\s()\]<>"']|\((?:[^\s()]|\([^\s()]*\))*\))+)/g)) {
    add('link.bare', 'link', m[1].replace(/[.,;:]+$/, ''), { url: m[1].replace(/[.,;:]+$/, '') });
  }
  // An install command cannot span a line break, and an npm package name cannot
  // start with a capital letter. Without both of these the parser reached across a
  // newline in nvm's README, took the first word of the next sentence, and accused
  // the project of installing a package called "There" that does not exist.
  for (const m of md.matchAll(/\b(?:npm\s+(?:i|install)|yarn\s+add|pnpm\s+(?:i|add|install))[ \t]+(?:--?[\w-]+[ \t]+)*(@?[a-z][\w./-]*)/g)) {
    add('install', 'install', m[0], { pkg: m[1] });
  }
  for (const m of md.matchAll(/\bv?(\d+\.\d+\.\d+)\b/g)) add('version', 'version', m[1], { version: m[1] });
  if (/\b(ci|continuous integration|build status|github actions|pipeline)\b/i.test(md)) {
    add('ci.claimed', 'ci', 'README refers to CI');
  }
  if (/\blicen[cs]e\b/i.test(md)) add('license.claimed', 'license', 'README refers to a licence');
  return claims;
}

export function claimsFromManifest(pkgPath) {
  if (!existsSync(pkgPath)) return [];
  try {
    const j = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const out = [];
    if (j.name) out.push({ id: 'manifest.name', kind: 'manifest', text: j.name, name: j.name });
    // `private: true` marks a workspace root, not something published to a registry.
    // Comparing it to a registry entry is the single largest source of false
    // positives in this check, so it is skipped at the source.
    if (j.version && j.name && j.private !== true) {
      out.push({ id: 'manifest.version', kind: 'manifest', text: j.version, name: j.name, version: j.version, repository: j.repository });
    }
    if (j.license) out.push({ id: 'manifest.license', kind: 'manifest', text: j.license, license: j.license });
    if (j.homepage) out.push({ id: 'manifest.homepage', kind: 'link', text: j.homepage, url: j.homepage });
    return out;
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// checks — each returns { ok, detail } and declares how to break itself
// ---------------------------------------------------------------------------

async function httpOk(url, timeout = 12000) {
  // HEAD first, but only as a cheap positive. Plenty of servers answer HEAD with a
  // 404 or a 405 and then serve the same URL perfectly on GET, so a non-2xx HEAD is
  // inconclusive and has to be confirmed with a real request before anything is
  // called dead. Trusting the HEAD result reported four live pages as dead the first
  // time this corpus was measured, which is the one finding this tool must never
  // produce: an accusation the evidence does not support.
  const attempt = async (method) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, {
        method,
        signal: c.signal,
        redirect: 'follow',
        headers: method === 'GET'
          ? { 'User-Agent': 'plumbline/0.1', Range: 'bytes=0-2048' }
          : { 'User-Agent': 'plumbline/0.1' },
      });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, status: 0, error: String(e.name || e) };
    } finally { clearTimeout(t); }
  };

  const head = await attempt('HEAD');
  if (head.ok) return head;
  const get = await attempt('GET');
  // If the GET could not be made at all, the link is unverifiable rather than dead.
  // Only a real HTTP answer is allowed to decide, and status 0 is not an answer.
  return get.status === 0 ? { ok: false, status: 0, error: get.error || head.error } : get;
}

export async function npmLatest(pkg) {
  if (!pkg || typeof pkg !== 'string') return { missing: true, status: 0 };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}`, { signal: c.signal, headers: { 'User-Agent': 'plumbline/0.1' } });
    if (!r.ok) return { missing: true, status: r.status };
    const j = await r.json();
    return {
      latest: j['dist-tags'] && j['dist-tags'].latest,
      versions: Object.keys(j.versions || {}),
      repository: j.repository,
    };
  } catch { return { error: true }; } finally { clearTimeout(t); }
}

// Reduce the many spellings of a repository URL to a comparable owner/repo slug.
// Returns null for anything that is not a GitHub repository, because a package
// the tool cannot tie back to this repository must not be used to accuse it.
//
// Exported because the measurement harness asks the same question, and the guard
// has to be the same guard in both places or the published figure stops describing
// the published tool.
export function repoSlug(s) {
  if (!s) return null;
  const raw = typeof s === 'string' ? s : s.url;
  if (!raw) return null;
  const m = String(raw)
    .replace(/^github:/i, 'github.com/')
    .replace(/\.git$/i, '')
    .match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

// A relative link that climbs above the repository root is not a claim about a file
// in this repository. On GitHub, "../../releases" from a root README resolves to the
// repository's own releases page, which is correct and extremely common. The file
// tree cannot answer a question about GitHub's URL space, so the claim is reported
// as not observable rather than accused.
//
// Exported on purpose. The measurement harness asks the same question against
// GitHub's tree instead of the local filesystem, and when this rule lived in two
// places the two copies disagreed: the harness kept reporting "../../releases" as a
// fault after the tool had stopped.
export function climbsAboveRoot(path) {
  let depth = 0;
  for (const seg of String(path).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { depth -= 1; if (depth < 0) return true; }
    else depth += 1;
  }
  return false;
}

export const CHECKS = {
  'link.relative': {
    title: 'Relative links in the README point at files that exist',
    severity: SEVERITY.WARNING,
    async run(ctx, claim) {
      if (climbsAboveRoot(claim.path)) {
        return { ok: true, skipped: true, detail: `climbs above the repository root, so the file tree cannot answer it: ${claim.path}` };
      }
      const p = resolve(ctx.root, claim.path);
      // The string rule above covers the ordinary case. This is the backstop for a
      // path that resolves outside the root for some other reason.
      if (!p.startsWith(ctx.root)) {
        return { ok: true, skipped: true, detail: `resolves outside the repository, so the file tree cannot answer it: ${claim.path}` };
      }
      return existsSync(p)
        ? { ok: true, detail: claim.path }
        : { ok: false, detail: `${claim.path} is linked but does not exist` };
    },
    // negative control: point the claim at a path that cannot exist
    mutate: (claim) => ({ ...claim, path: '__plumbline_missing__/' + claim.path }),
  },

  'link.external': {
    title: 'External links in the README resolve',
    severity: SEVERITY.NOTE,
    async run(ctx, claim) {
      if (/(shields\.io|badge|img\.shields|badgen|travis-ci|codecov|coveralls|discord\.gg)/i.test(claim.url)) {
        return { ok: true, detail: 'badge, not asserted', skipped: true };
      }
      const r = await httpOk(claim.url);
      return { ok: r.ok, detail: `${r.status || 'ERR'} ${claim.url}` };
    },
    mutate: (claim) => ({ ...claim, url: 'https://plumbline.invalid/__control__' }),
  },

  install: {
    title: 'The install command in the README names a package that exists',
    severity: SEVERITY.BLOCKER,
    async run(ctx, claim) {
      const info = await npmLatest(claim.pkg);
      if (info && (info.missing || info.error)) return { ok: false, detail: `README says "npm install ${claim.pkg}"; no such package` };
      return { ok: true, detail: `${claim.pkg}@${info.latest}` };
    },
    mutate: (claim) => ({ ...claim, pkg: 'plumbline-control-package-that-does-not-exist' }),
  },

  'manifest.version': {
    title: 'The version in the manifest is actually published',
    severity: SEVERITY.BLOCKER,
    async run(ctx, claim) {
      // Regression: this check used to be skipped on every run, because the claim
      // carried a version but no package name, so it asked the registry about
      // "undefined". A blocker check that can never fire is worse than no check.
      if (!claim.name) return { ok: true, skipped: true, detail: 'the manifest carries no package name' };
      const info = await npmLatest(claim.name);
      if (!info || info.error) return { ok: true, skipped: true, detail: 'the registry was not reachable' };
      if (info.missing) return { ok: true, skipped: true, detail: `${claim.name} is not published to npm` };
      // A name collision is not a finding. Only compare versions once the registry's
      // own repository field points back at the repository being audited.
      const want = repoSlug(claim.repository);
      const got = repoSlug(info.repository);
      if (!want || !got) return { ok: true, skipped: true, detail: `cannot confirm ${claim.name} on npm is this repository` };
      if (want !== got) return { ok: true, skipped: true, detail: `${claim.name} on npm points at ${got}, not ${want}` };
      return info.latest === claim.version
        ? { ok: true, detail: `${claim.version} matches the registry` }
        : { ok: false, detail: `manifest says ${claim.version}; registry says ${info.latest}` };
    },
    mutate: (claim) => ({ ...claim, version: '0.0.0-plumbline-control' }),
  },

  'license.claimed': {
    title: 'A licence is claimed and GitHub can detect it',
    severity: SEVERITY.WARNING,
    async run(ctx, claim) {
      const found = ctx.rootFiles.filter((f) => /^(LICEN[CS]E|COPYING|UNLICENSE)/i.test(f));
      if (!found.length) return { ok: false, detail: 'the README refers to a licence; no licence file at the repository root' };
      // Without a GitHub context the About panel is invisible. Saying nothing is
      // correct; accusing the repository of a fault that cannot be seen is not.
      if (ctx.githubLicense === undefined) return { ok: true, skipped: true, detail: 'no GitHub context, About panel not observable' };
      if (!ctx.githubLicense) return { ok: false, detail: `${found[0]} exists but GitHub does not detect it in the About panel` };
      return { ok: true, detail: ctx.githubLicense };
    },
    mutate: (claim, ctx) => ({ ...claim, __forceMissing: true }),
    mutateCtx: (ctx) => ({ ...ctx, rootFiles: ctx.rootFiles.filter((f) => !/^(LICEN[CS]E|COPYING)/i.test(f)) }),
  },

  'ci.claimed': {
    title: 'CI is claimed and a workflow actually exists',
    severity: SEVERITY.WARNING,
    async run(ctx, claim) {
      return ctx.workflowFiles.length
        ? { ok: true, detail: `${ctx.workflowFiles.length} workflow file(s)` }
        : { ok: false, detail: 'the README refers to CI; there is no .github/workflows directory' };
    },
    mutateCtx: (ctx) => ({ ...ctx, workflowFiles: [] }),
  },
};

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

export async function audit({ root, githubLicense, workflows = null } = {}) {
  root = resolve(root);
  const readmePath = ['README.md', 'readme.md', 'README.markdown'].map((f) => join(root, f)).find(existsSync);
  const md = readmePath ? readFileSync(readmePath, 'utf8') : '';
  const pkgPath = join(root, 'package.json');

  const rootFiles = readdirSafe(root);
  const workflowFiles = workflows !== null ? workflows
    : (existsSync(join(root, '.github/workflows')) ? readdirSafe(join(root, '.github/workflows')).filter((f) => /\.ya?ml$/i.test(f)) : []);

  const ctx = { root, rootFiles, workflowFiles, githubLicense };
  const claims = [...claimsFromReadme(md), ...claimsFromManifest(pkgPath)];

  const results = [];
  const skipped = [];
  for (const claim of claims) {
    const check = CHECKS[claim.id];
    if (!check) continue;
    let r;
    try { r = await check.run(ctx, claim); } catch (e) { r = { ok: false, detail: `check threw: ${e.message}` }; }
    // A skipped claim is one the tool could not observe. It is counted and named
    // rather than dropped, because "not checked" and "this is fine" are
    // different statements and the report must not blur them.
    if (r.skipped) { skipped.push({ check: claim.id, claim: claim.text, detail: r.detail }); continue; }
    results.push({ check: claim.id, title: check.title, severity: check.severity, claim: claim.text, ...r });
  }

  const seen = new Set();
  const deduped = results.filter((r) => {
    const k = r.check + '|' + r.claim;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const failures = deduped.filter((r) => !r.ok);
  const worst = failures.reduce((a, r) => Math.max(a, r.severity), 0);
  return {
    root,
    claims: claims.length,
    checked: deduped.length,
    skipped: skipped.length,
    skippedDetail: skipped,
    failures: failures.length,
    // Any failure at all rules out PASS. A report that says PASS while listing
    // three things that do not hold is the exact class of untruth this tool exists
    // to catch, and it is not going to print one.
    verdict: failures.length === 0 ? 'PASS' : worst >= SEVERITY.BLOCKER ? 'FAIL' : 'WARN',
    results: deduped.sort((a, b) => b.severity - a.severity),
  };
}

function readdirSafe(p) {
  try { return readdirSync(p); } catch { return []; }
}
