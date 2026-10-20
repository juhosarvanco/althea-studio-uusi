import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import * as Y from 'yjs';
import WS from 'ws';
import { parseHTML } from 'linkedom';
import { createStudioServer } from '../server.mjs';
import { GithubLogin, ACCOUNT_IDS } from '../auth.mjs';
import { issueStudioToken } from '../../shared/studio-token.mjs';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { schema } from '../schema.mjs';
import { vector } from '../store.mjs';
import { requireTopLevel, studioPolicy } from '../security.mjs';

const secret = 'security-regression-test-secret-at-least-32';
const origin = 'https://www.althea.fi';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'althea-security-'));
  let now = Date.now();
  const login = new GithubLogin({ clientId: 'test-client', allowed: ['juhosarvanco', 'juliagrahn'], directory, secret, now: () => now,
    fetcher: async url => new Response(JSON.stringify(url.endsWith('/device/code')
      ? { device_code: 'private-device', user_code: 'TEST-CODE', verification_uri: 'https://github.com/login/device' }
      : url.endsWith('/access_token') ? { access_token: 'private-test-github-token' }
      : { login: 'juhosarvanco', id: ACCOUNT_IDS.juhosarvanco })) });
  const attempt = await login.begin('test'); now += 5000;
  const identity = await login.poll(attempt.id);
  const server = await createStudioServer({ port: 0, dataDir: directory, secret, allowed: login.allowed, origins: [origin], login });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.port}`, token = issueStudioToken(identity.user, secret);
  return { server, base, token, identity, login };
}

test('every content route denies anonymous and forged credentials in both languages; only the publisher can update publication metadata', async t => {
  const { server, base, token } = await fixture(t);
  const reads = ['layout', 'versions', 'field-history?fieldId=alku-h1-1', 'media', 'media-file/' + 'a'.repeat(64)];
  const writes = ['studio-publish', 'published', 'export', 'checkpoint', 'restore', 'field-restore', 'media-upload', 'media-assign', 'media-delete', 'media-restore', 'poll-open', 'poll-read', 'poll-send', 'poll-close'];
  for (const prefix of ['/api/', '/api/en/']) for (const [method, paths] of [['GET', reads], ['POST', writes]]) for (const path of paths) {
    const response = await fetch(base + prefix + path, { method, headers: { Origin: origin }, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(response.status, 401, method + ' ' + prefix + path); await response.arrayBuffer();
  }
  const forged = issueStudioToken({ login: 'juhosarvanco', sid: 'invented' }, 'attacker-controlled-secret-longer-than-32');
  const noSession = issueStudioToken({ login: 'juhosarvanco', sid: 'invented' }, secret);
  for (const credential of [forged, noSession, token + 'tampered', issueStudioToken({ login: 'outsider' }, secret), issueStudioToken({ login: 'juhosarvanco' }, secret, Date.now() - 901000)]) {
    assert.equal((await fetch(base + '/api/layout', { headers: { authorization: `Bearer ${credential}`, Origin: origin } })).status, 401);
  }
  const before = server.store.export();
  const post = (path, from = origin) => fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, ...(from ? { Origin: from } : {}) }, body: JSON.stringify({ previousHash: before.publicHash, publicHash: 'a'.repeat(64), vector: before.vector }) });
  assert.equal((await post('/api/checkpoint', null)).status, 403);
  assert.equal((await post('/api/checkpoint', 'https://attacker.example')).status, 403);
  assert.equal((await post('/api/published')).status, 404);
  assert.deepEqual(server.store.export(), before);
  assert.equal((await fetch(base + '/api/layout', { headers: { authorization: `Bearer ${token}`, Origin: origin } })).status, 200);
  for (const path of ['/.env.studio', '/.git/config', '/.studio-live/data/github-sessions.enc', '/studio/server.mjs', '/%2e%2e%2f.env.studio']) {
    const status = await new Promise((resolve, reject) => {
      httpGet(base + path, { headers: { Host: 'public-tunnel.example' } }, response => { response.resume(); resolve(response.statusCode); }).once('error', reject);
    });
    assert.equal(status, 404, path);
  }
  assert.equal((await fetch(base + '/api/local-layout', { headers: { authorization: `Bearer ${secret}`, 'cf-connecting-ip': '1.2.3.4' } })).status, 403);
  assert.equal((await fetch(base + '/api/en/local-layout', { headers: { authorization: `Bearer ${secret}`, 'x-forwarded-for': '1.2.3.4' } })).status, 403);
});

test('logout invalidates native WebSockets, HTTPS connections and access tokens immediately', async t => {
  const { base, token, identity } = await fixture(t);
  const headers = { authorization: `Bearer ${token}`, Origin: origin };
  const socket = new WS(base.replace('http', 'ws') + '/sync/althea-uusi', [`althea-auth.${token}`], { origin });
  socket.on('error', () => {}); t.after(() => socket.terminate());
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const closed = new Promise(resolve => socket.once('close', code => resolve(code)));
  const response = await fetch(base + '/api/en/poll-open', { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200); const polling = await response.json();
  assert.ok(polling.id);
  const out = await fetch(base + '/api/logout', { method: 'POST', headers: { ...headers, authorization: `Bearer althea-remember.${identity.remember}` } });
  assert.equal(out.status, 200); assert.equal(await closed, 4001);
  assert.equal((await fetch(base + '/api/layout', { headers })).status, 401);
  assert.equal((await fetch(base + '/api/en/poll-read', { method: 'POST', headers, body: JSON.stringify({ id: polling.id }) })).status, 401);
});

test('shared rich text cannot inject executable markup or links into published pages', async t => {
  const { server } = await fixture(t), store = server.store;
  const field = store.manifest.fields.find(f => f.tag === 'h1').id;
  for (const href of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
    const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(store.doc));
    const fragment = candidate.getXmlFragment(field); fragment.delete(0, fragment.length);
    prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>', marks: [{ type: 'link', attrs: { href } }] }] }] }, fragment);
    store.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(store.doc)), 'test', { sub: 'juhosarvanco' }); candidate.destroy();
    const { document } = parseHTML(store.export().html), heading = document.querySelector(`[data-studio-field="${field}"]`);
    assert.equal(heading.querySelector('img,script'), null); assert.equal(heading.querySelector('a').getAttribute('href'), '#');
    assert.equal(heading.textContent, '<img src=x onerror=alert(1)>');
  }
  const before = vector(store.doc), candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(store.doc));
  const fragment = candidate.getXmlFragment(field); fragment.delete(0, fragment.length); fragment.insert(0, [new Y.XmlElement('script')]);
  assert.throws(() => store.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(store.doc)), 'test'));
  assert.equal(vector(store.doc), before); candidate.destroy();
});

test('Studio blocks frame initialisation and applies a restrictive policy before loading scripts', async () => {
  const { document } = parseHTML('<html><head></head><body><button id="publish">Publish</button></body></html>');
  const window = { self: {}, top: {}, location: { href: 'https://www.althea.fi/en/studio/' } };
  assert.throws(() => requireTopLevel(window, document), /cannot run inside a frame/);
  assert.equal(document.querySelector('#publish'), null);
  assert.equal(document.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
  window.top = window.self; assert.doesNotThrow(() => requireTopLevel(window, document));
  const policy = studioPolicy('https://assigned.trycloudflare.com', 'https://althea-studio-connect.netlify.app');
  assert.ok(policy.includes("script-src 'self';")); assert.ok(!policy.includes('unsafe-eval'));
  assert.ok(policy.includes("base-uri 'none'")); assert.ok(policy.includes('wss://assigned.trycloudflare.com'));
  assert.ok(!policy.includes('localhost'));
  for (const path of ['site/studio/index.html', 'site/en/studio/index.html']) {
    const built = parseHTML(await readFile(new URL('../../' + path, import.meta.url), 'utf8')).document;
    assert.equal(built.head.firstElementChild.getAttribute('http-equiv'), 'Content-Security-Policy');
    assert.ok(built.head.firstElementChild.content.includes("script-src 'self'"));
    assert.equal(built.querySelector('meta[name="referrer"]').content, 'no-referrer');
  }
});
