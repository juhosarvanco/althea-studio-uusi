import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import WS from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import { createStudioServer } from '../server.mjs';
import { HttpSocket } from '../http-socket.js';
import { connectionRequest } from '../connection.js';
import { vector } from '../store.mjs';
import { issueStudioToken } from '../../shared/studio-token.mjs';
import { relayFiles } from '../../tools/studio-relay.mjs';

const secret = 'https-transport-test-secret-over-thirty-two';
const origin = 'https://www.althea.fi';
const waitFor = async predicate => { const end = Date.now() + 8000; while (!predicate()) { if (Date.now() > end) throw Error('HTTPS synchronization timed out'); await new Promise(r => setTimeout(r, 20)); } };
function client(server, login, language = 'fi', https = false, doc = new Y.Doc()) {
  const token = issueStudioToken({ login, name: login, sid: login + '-saved-session' }, secret);
  const request = (url, options) => fetch(url, { ...options, headers: { ...options.headers, Origin: origin } });
  const Socket = https ? class { constructor() { return new HttpSocket({ server: `http://127.0.0.1:${server.port}`, path: language === 'en' ? '/api/en/' : '/api/', token: () => token, request }); } }
    : class extends WS { constructor(url) { super(url, [`althea-auth.${token}`], { headers: { Origin: origin } }); } };
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/sync`, language === 'en' ? 'althea-uusi-en' : 'althea-uusi', doc, { WebSocketPolyfill: Socket, disableBc: true });
  for (const type of [4, 5, 6]) provider.messageHandlers[type] = () => {};
  return { doc, provider, token, close() { provider.destroy(); doc.destroy(); } };
}

test('HTTPS and WebSocket clients share edits and signed presence, enforce identity, preserve undo and persist through restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-https-'));
  const options = { port: 0, secret, dataDir: directory, origins: [origin], allowed: ['juho', 'julia'], login: { check() {} } };
  let server = await createStudioServer(options);
  const juho = client(server, 'juho'), julia = client(server, 'julia', 'fi', true), english = client(server, 'julia', 'en', true);
  t.after(async () => { for (const c of [juho, julia, english]) c.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => [juho, julia, english].every(c => c.provider.synced));
  const enBefore = server.contexts.get('en').store.export();
  for (const c of [juho, julia]) c.provider.awareness.setLocalStateField('user', { name: 'Spoofed name' });
  await waitFor(() => juho.provider.awareness.getStates().get(julia.doc.clientID)?.user?.login === 'julia');
  assert.equal(juho.provider.awareness.getStates().get(julia.doc.clientID).user.name, 'julia');
  const field = server.store.manifest.fields.find(f => f.tag === 'h1').id;
  const localOrigin = {}, undo = new Y.UndoManager(julia.doc.getXmlFragment(field), { trackedOrigins: new Set([localOrigin]) });
  julia.doc.transact(() => julia.doc.getXmlFragment(field).get(0).get(0).insert(0, 'Julian HTTPS. '), localOrigin);
  juho.doc.getXmlFragment(field).get(0).get(0).insert(0, 'Juhon WebSocket. ');
  julia.doc.getMap('comments').set('https-comment', { fieldId: field, body: 'HTTPS comment', author: 'Julia', createdAt: new Date().toISOString(), resolved: false });
  await waitFor(() => vector(julia.doc) === vector(juho.doc) && server.store.export().html.includes('Julian HTTPS. '));
  assert.ok(server.store.export().html.includes('Juhon WebSocket. '));
  undo.undo();
  await waitFor(() => !server.store.export().html.includes('Julian HTTPS. '));
  assert.ok(server.store.export().html.includes('Juhon WebSocket. '));
  assert.equal(server.store.comments.get('https-comment').body, 'HTTPS comment');
  assert.deepEqual(server.contexts.get('en').store.export(), enBefore);
  const base = `http://127.0.0.1:${server.port}`;
  const post = (path, body, token = julia.token, from = origin) => fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, Origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const id = julia.provider.ws.id;
  assert.equal((await post('/api/poll-read', { id }, juho.token)).status, 410);
  assert.equal((await post('/api/en/poll-read', { id })).status, 410);
  assert.equal((await post('/api/poll-open', {}, '')).status, 401);
  assert.equal((await post('/api/poll-open', {}, julia.token, 'https://evil.example')).status, 403);
  assert.equal((await post('/api/poll-send', { id, messages: ['not valid base64!'] })).status, 400);
  // The same document stays mounted when a connection drops and returns.
  julia.provider.disconnect();
  julia.doc.getXmlFragment(field).get(0).get(0).insert(0, 'Offline HTTPS edit. ');
  julia.provider.connect();
  await waitFor(() => julia.provider.synced && vector(julia.doc) === vector(server.store.doc));
  assert.ok(server.store.export().html.includes('Offline HTTPS edit. '));
  // HTTPS cannot bypass the existing server-owned metadata validation.
  const attack = new Y.Doc(); attack.getMap('unknown').set('malicious', true);
  const packet = encoding.createEncoder(); encoding.writeVarUint(packet, 0); encoding.writeVarUint(packet, 2); encoding.writeVarUint8Array(packet, Y.encodeStateAsUpdate(attack));
  const socket = julia.provider.ws;
  socket.send(encoding.toUint8Array(packet));
  await waitFor(() => socket.readyState === 3 && julia.provider.synced);
  assert.equal(server.store.doc.share.has('unknown'), false); attack.destroy();
  const snapshot = server.store.export(), history = server.store.fieldHistory(field);
  assert.ok(history.entries.some(entry => entry.author?.login === 'julia'));
  undo.destroy(); for (const c of [juho, julia, english]) c.close();
  await server.close(); server = await createStudioServer(options);
  assert.deepEqual(server.store.export(), snapshot);
  assert.deepEqual(server.store.fieldHistory(field), history);
  assert.equal(server.store.comments.get('https-comment').body, 'HTTPS comment');
  assert.deepEqual(server.contexts.get('en').store.export(), enBefore);
});

test('blocked primary connections fall back without losing authorization; valid account denials never take another route', async () => {
  const config = { server: 'https://primary.example', relay: 'https://backup.example' }, calls = [];
  const request = async (url, options) => {
    calls.push(url); assert.equal(options.headers.authorization, 'Bearer same-saved-login');
    if (url.startsWith(config.server)) throw new TypeError('DNS blocked on this hotspot');
    return new Response(JSON.stringify({ token: 'same-studio-server-token' }));
  };
  const result = await connectionRequest(config, '/api/studio-session', { headers: { authorization: 'Bearer same-saved-login' } }, request);
  assert.equal(result.server, config.relay); assert.equal(result.transport, 'https'); assert.equal(calls.length, 2);
  for (const status of [401, 403]) {
    const denied = [];
    const response = await connectionRequest(config, '/api/studio-session', {}, async url => { denied.push(url); return new Response(JSON.stringify({ error: 'Not authorized' }), { status }); });
    assert.equal(response.response.status, status); assert.deepEqual(denied, [config.server + '/api/studio-session']);
  }
  const preferred = await connectionRequest({ ...config, preferRelay: true }, '/api/studio-session', {}, async url => { assert.ok(url.startsWith(config.relay)); return new Response('{}'); });
  assert.equal(preferred.transport, 'https');
});

test('the backup deploy is a fixed upstream proxy, excludes local operator routes and contains no site drafts', () => {
  const files = relayFiles('https://assigned.trycloudflare.com');
  assert.ok(files['/_redirects'].includes('/api/* https://assigned.trycloudflare.com/api/:splat 200!'));
  assert.ok(files['/_redirects'].startsWith('/api/local-layout /404.html 404!'));
  assert.ok(files['/_headers'].includes('no-store'));
  assert.deepEqual(Object.keys(files).sort(), ['/404.html', '/_headers', '/_redirects', '/index.html', '/robots.txt'].sort());
  assert.throws(() => relayFiles('http://127.0.0.1:8796'));
});
