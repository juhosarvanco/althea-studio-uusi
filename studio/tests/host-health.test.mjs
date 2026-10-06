import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { studioReachable } from '../../tools/studio-health.mjs';

test('remote health must confirm the Studio, not just an existing tunnel process', async t => {
  let status = 200, body = '{"ok":true}';
  const server = createServer((req, res) => {
    assert.equal(req.url, '/health');
    res.writeHead(status, {'content-type':'application/json'}); res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await studioReachable(address), true);
  status = 503; assert.equal(await studioReachable(address), false);
  status = 200; body = '<html>Tunnel unavailable</html>'; assert.equal(await studioReachable(address), false);
  body = '{"ok":false}'; assert.equal(await studioReachable(address), false);
});

test('expired DNS and bounded network timeouts are treated as an unavailable connection', async () => {
  const request = async (_, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    throw new TypeError('fetch failed');
  };
  assert.equal(await studioReachable('https://expired.trycloudflare.com', {request}), false);
  const hangingRequest = (_, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once:true});
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try { assert.equal(await studioReachable('https://expired.trycloudflare.com', {request:hangingRequest, timeoutMs:20}), false); }
  finally { clearTimeout(keepAlive); }
});

test('invalid or credential-bearing connection addresses are not requested', async () => {
  let requests = 0;
  const request = () => { requests++; throw new Error('Must not request invalid addresses'); };
  for (const address of [null, 'not-a-url', 'https://secret@example.com', 'http://example.com', 'https://example.com/private']) {
    assert.equal(await studioReachable(address, {request}), false);
  }
  assert.equal(requests, 0);
});
