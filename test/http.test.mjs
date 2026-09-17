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
