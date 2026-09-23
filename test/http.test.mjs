// The HTTP check, against a local server.
//
// These run offline and they are exact: the server decides what each method
// returns, so there is no guessing about what a real host would have done.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { CHECKS } from '../src/plumbline.mjs';

async function withServer(handler, fn) {
  const srv = createServer(handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  try { return await fn(url); } finally { await new Promise((r) => srv.close(r)); }
}

test('a server that answers HEAD with 404 and GET with 200 is not reported dead', async () => {
  // Regression, and the most expensive one so far. This is a live page. Trusting the
  // HEAD result reported four real URLs as dead in the first measurement of the
  // corpus, which is the one finding this tool must never produce.
  await withServer((req, res) => {
    if (req.method === 'HEAD') { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end('ok'); }
  }, async (url) => {
    const r = await CHECKS['link.external'].run({}, { id: 'link.external', url });
    assert.equal(r.ok, true, `expected a pass, got: ${r.detail}`);
    assert.equal(r.detail, `200 ${url}`);
  });
});

test('a server that answers HEAD with 405 and GET with 200 is not reported dead', async () => {
  await withServer((req, res) => {
    if (req.method === 'HEAD') { res.writeHead(405); res.end(); } else { res.writeHead(200); res.end('ok'); }
  }, async (url) => {
    const r = await CHECKS['link.external'].run({}, { id: 'link.external', url });
    assert.equal(r.ok, true, `expected a pass, got: ${r.detail}`);
  });
});

test('a server that varies its answer on Accept-Language is not reported dead', async () => {
  // Regression, and the second time a live page was called dead. IBM's geo-router
  // emits a malformed `https://www.ibm.com/gb-*` redirect, which 404s, when it cannot
  // resolve a locale from the request. A browser names a language and lands on the
  // locale page, so the README link works for every reader and the tool was calling
  // it dead.
  //
  // The header that matters is not absence. Node's fetch sends `Accept-Language: *`
  // on its own, and a literal `*` is exactly what the router cannot use. An earlier
  // version of this test 404'd on an absent header, so it passed with the fix
  // removed and proved nothing. This one rejects `*` as well, which is the value
  // that actually arrives.
  await withServer((req, res) => {
    const lang = req.headers['accept-language'];
    if (!lang || lang === '*') { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end('ok'); }
  }, async (url) => {
    const r = await CHECKS['link.external'].run({}, { id: 'link.external', url });
    assert.equal(r.ok, true, `expected a pass, got: ${r.detail}`);
  });
});

test('the request names a language and identifies itself', async () => {
  // The other half, asserted directly rather than inferred from a status code. The
  // tool must still say who it is: a site that blocks this agent answers 403, and 403
  // reads as unverifiable rather than as dead, so identifying honestly costs nothing.
  let seen = null;
  await withServer((req, res) => { seen = req.headers; res.writeHead(200); res.end('ok'); }, async (url) => {
    await CHECKS['link.external'].run({}, { id: 'link.external', url });
    assert.equal(seen['user-agent'], 'plumbline/0.1');
    assert.notEqual(seen['accept-language'], '*', 'the wildcard is what the geo-router cannot resolve');
    assert.match(seen['accept-language'] || '', /^[a-z]{2}/i, 'no language tag was sent');
    assert.match(seen.accept || '', /text\/html/);
  });
});

test('a genuine 404 on both HEAD and GET is still reported', async () => {
  await withServer((req, res) => { res.writeHead(404); res.end(); }, async (url) => {
    const r = await CHECKS['link.external'].run({}, { id: 'link.external', url });
    assert.equal(r.ok, false);
    assert.match(r.detail, /^404 /);
  });
});

test('a URL that cannot be reached at all is not called dead', async () => {
  // status 0 is not an HTTP answer. Unverifiable must never read as a finding, and
  // the caller has to be able to tell the two apart.
  const r = await CHECKS['link.external'].run({}, { id: 'link.external', url: 'http://127.0.0.1:1/' });
  assert.equal(r.ok, false);
  assert.match(r.detail, /^ERR /);
});

test('a badge is not asserted, so it is skipped rather than checked', async () => {
  const r = await CHECKS['link.external'].run({}, { id: 'link.external', url: 'https://img.shields.io/badge/x-y.svg' });
  assert.equal(r.skipped, true);
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// A registry that will not answer is not a package that does not exist.
//
// Found on 23 September by running the whole corpus twice and diffing the two
// results: `openclaw/openclaw` failed on `install` in one run and passed in the
// other, with nothing about the repository changing between them. The registry had
// throttled, and `npmLatest` returned `missing` for any non-ok response, so a 429
// became "README says npm install openclaw; no such package". `install` is a
// BLOCKER, so that is the loudest thing the tool can say, said about a repository
// that may be entirely fine.
//
// `globalThis.fetch` is stubbed rather than a server started, because the registry
// URL is not configurable and should not become so for a test's convenience.
// ---------------------------------------------------------------------------

async function withRegistryReply(status, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(status === 200 ? '{}' : '', { status });
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('a throttled registry does not become a missing package', async () => {
  await withRegistryReply(429, async () => {
    const r = await CHECKS.install.run({}, { id: 'install', pkg: 'openclaw' });
    assert.equal(r.ok, true, `a 429 must not be an accusation, got: ${r.detail}`);
    assert.equal(r.skipped, true, 'a throttled lookup is skipped, not asserted');
    assert.match(r.detail, /429/);
  });
});

test('a registry that answers 500 does not become a missing package', async () => {
  await withRegistryReply(503, async () => {
    const r = await CHECKS.install.run({}, { id: 'install', pkg: 'openclaw' });
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
  });
});

test('a genuine 404 is still reported as a package that does not exist', async () => {
  // The other direction, and the one that must not be lost: the guard above is only
  // worth anything if a real absence still fails. Without this the fix would turn a
  // blocker into a silence.
  await withRegistryReply(404, async () => {
    const r = await CHECKS.install.run({}, { id: 'install', pkg: 'plumbline-control-package-that-does-not-exist' });
    assert.equal(r.ok, false);
    assert.equal(r.skipped, undefined);
    assert.match(r.detail, /no such package/);
  });
});
