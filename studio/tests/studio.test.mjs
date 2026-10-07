import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WS from 'ws';
import * as encoding from 'lib0/encoding';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { createStudioServer } from '../server.mjs';
import { StudioStore, vector } from '../store.mjs';
import { prepareTemplate } from '../template.mjs';
import { issueStudioToken, verifyStudioToken } from '../../shared/studio-token.mjs';

const secret = 'test-only-althea-secret-at-least-32-characters';
const waitFor = async predicate => { const deadline = Date.now() + 6000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Synchronization timed out'); await new Promise(resolve => setTimeout(resolve, 20)); } };
function client(server, login, origin = `http://127.0.0.1:${server.port}`) {
  const doc = new Y.Doc();
  const token = issueStudioToken({ login, name: login }, secret);
  const Socket = class extends WS { constructor(url) { super(url, [`althea-auth.${token}`], { headers: { Origin: origin } }); } };
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/sync`, 'althea-uusi', doc, { WebSocketPolyfill: Socket, disableBc: true });
  provider.messageHandlers[4] = () => {};
  return { doc, provider, close: () => { provider.destroy(); doc.destroy(); } };
}
const plain = (doc, field) => (yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(field)).content?.[0]?.content || []).map(node => node.text || '\n').join('');

test('a connected editor cannot resurrect another disconnected editor as a duplicate avatar', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-presence-'));
  const server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  const a = client(server, 'juho'), b = client(server, 'julia'), observer = client(server, 'juho');
  t.after(async () => { a.close(); b.close(); observer.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => a.provider.synced && b.provider.synced && observer.provider.synced);
  for (const peer of [a, b, observer]) peer.provider.awareness.setLocalStateField('user', { name: 'Fake' });
  await waitFor(() => observer.provider.awareness.getStates().has(a.doc.clientID) && observer.provider.awareness.getStates().has(b.doc.clientID));
  a.provider.disconnect();
  await waitFor(() => !observer.provider.awareness.getStates().has(a.doc.clientID));

  // A reconnecting browser can relay an old peer along with its own updated state.
  const update = encoding.createEncoder(); encoding.writeVarUint(update, 2);
  for (const [id, clock, state] of [
    [a.doc.clientID, 100000, { user: { name: 'Fake ghost' } }],
    [b.doc.clientID, b.provider.awareness.meta.get(b.doc.clientID).clock + 1,
      { user: { name: 'Fake' }, activeField: 'kokemus-lyhyesti-h2-1' }]
  ]) { encoding.writeVarUint(update, id); encoding.writeVarUint(update, clock); encoding.writeVarString(update, JSON.stringify(state)); }
  const packet = encoding.createEncoder(); encoding.writeVarUint(packet, 1);
  encoding.writeVarUint8Array(packet, encoding.toUint8Array(update)); b.provider.ws.send(encoding.toUint8Array(packet));
  await waitFor(() => observer.provider.awareness.getStates().get(b.doc.clientID)?.activeField === 'kokemus-lyhyesti-h2-1');
  assert.equal(observer.provider.awareness.getStates().has(a.doc.clientID), false);
  assert.equal(observer.provider.awareness.getStates().get(b.doc.clientID).user.login, 'julia');
  a.provider.connect();
  a.provider.awareness.setLocalStateField('user', { name: 'Fake' });
  await waitFor(() => observer.provider.awareness.getStates().has(a.doc.clientID));
  assert.equal(observer.provider.awareness.getStates().get(a.doc.clientID).user.login, 'juho');
});

test('tokens reject tampering, expiry and users outside the allowlist', () => {
  const token = issueStudioToken({ login: 'juho' }, secret, 1000000);
  assert.equal(verifyStudioToken(token, secret, ['juho'], 1000000).sub, 'juho');
  assert.throws(() => verifyStudioToken(token.slice(0, -2) + 'aa', secret, ['juho'], 1000000));
  assert.throws(() => verifyStudioToken(token, secret, ['julia'], 1000000));
  assert.throws(() => verifyStudioToken(token, secret, ['juho'], 2000000));
  assert.throws(() => issueStudioToken({ login: 'juho' }, 'short'));
});

test('layout fingerprint survives text publication and empty fields; layout edits are detected', async () => {
  const { manifest, template } = prepareTemplate(await readFile(new URL('../../site/index.html', import.meta.url), 'utf8'));
  const field = manifest.fields[0];
  const empty = template.replace(/(<p[^>]*data-studio-field="alku-p-1"[^>]*>)[\s\S]*?<\/p>/, '$1</p>');
  assert.equal(prepareTemplate(empty).manifest.layoutHash, manifest.layoutHash);
  assert.equal(prepareTemplate(empty).manifest.fields[0].id, field.id);
  assert.notEqual(prepareTemplate(template.replace('--paper:#faf8f4', '--paper:#eeeeee')).manifest.layoutHash, manifest.layoutHash);
});

test('two independent websocket clients merge concurrent text, preserve remote undo, persist and restore', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-studio-'));
  let server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  const a = client(server, 'juho'), b = client(server, 'julia');
  t.after(async () => { a.close(); b.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => a.provider.synced && b.provider.synced);
  a.provider.awareness.setLocalStateField('user', { name: 'Fake', color: '#000000' });
  b.provider.awareness.setLocalStateField('user', { name: 'Fake', color: '#000000' });
  await waitFor(() => a.provider.awareness.getStates().has(b.doc.clientID));
  assert.equal(a.provider.awareness.getStates().get(b.doc.clientID).user.name, 'julia');
  const id = 'kokemus-lyhyesti-h2-1', initial = plain(a.doc, id);
  assert.equal(initial, plain(b.doc, id));
  assert.ok(initial.length > 5);
  const aText = a.doc.getXmlFragment(id).get(0).get(0), bText = b.doc.getXmlFragment(id).get(0).get(0);
  const ownOrigin = {};
  const undo = new Y.UndoManager(a.doc.getXmlFragment(id), { trackedOrigins: new Set([ownOrigin]) });
  a.provider.disconnect(); b.provider.disconnect();
  a.doc.transact(() => aText.insert(0, 'Juhon alku. '), ownOrigin);
  bText.insert(bText.length, ' Julian loppu.');
  a.provider.connect(); b.provider.connect();
  await waitFor(() => plain(a.doc, id).includes('Julian loppu.') && plain(b.doc, id).includes('Juhon alku.'));
  assert.equal(plain(a.doc, id), plain(b.doc, id));
  undo.undo();
  await waitFor(() => !plain(b.doc, id).includes('Juhon alku.'));
  assert.ok(plain(a.doc, id).includes('Julian loppu.'));
  await waitFor(() => vector(a.doc) === vector(server.store.doc));
  const checkpoint = server.store.checkpoint('Yhteinen tarkistus', 'Juho');
  const beforeDeletion = vector(server.store.doc);
  bText.delete(bText.length - 1, 1);
  await waitFor(() => vector(b.doc) === vector(server.store.doc));
  assert.notEqual(vector(server.store.doc), beforeDeletion);
  assert.throws(() => server.store.restore(checkpoint.id, beforeDeletion, 'Juho'), /muuttui/);
  bText.insert(bText.length, '.');
  await waitFor(() => vector(b.doc) === vector(server.store.doc));
  bText.insert(0, 'Uusi muutos. ');
  await waitFor(() => plain(server.store.doc, id).startsWith('Uusi muutos.'));
  assert.throws(() => server.store.restore(checkpoint.id, checkpoint.vector, 'Juho'), /muuttui/);
  server.store.restore(checkpoint.id, vector(server.store.doc), 'Juho');
  await waitFor(() => !plain(a.doc, id).startsWith('Uusi muutos.'));
  const exported = server.store.export();
  assert.ok(exported.html.includes('Julian loppu.'));
  assert.ok(!exported.html.includes('studio-bar'));
  assert.equal(prepareTemplate(exported.html).manifest.layoutHash, exported.layoutHash);
  server.store.published(exported.publicHash, 'a'.repeat(64));
  assert.equal(server.store.export().publicHash, 'a'.repeat(64));
  a.close(); b.close(); undo.destroy();
  await server.close();
  // Simulate a crash during the last append; earlier acknowledged edits survive.
  await appendFile(join(directory, 'updates.bin'), Buffer.from([0, 0, 0, 10, 1, 2]));
  server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  assert.ok(plain(server.store.doc, id).includes('Julian loppu.'));
  assert.ok(server.store.versions().some(version => version.title === 'Yhteinen tarkistus'));
});

test('remote service blocks anonymous access, foreign origins, development impersonation and stale exports', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-auth-'));
  const server = await createStudioServer({ port: 0, secret, allowed: ['juho'], origins: ['https://editor.example'], dataDir: directory, login: { check() {} } });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.port}`;
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/api/versions')).status, 401);
  assert.equal((await fetch(base + '/api/studio-session?name=juho')).status, 401);
  const token = issueStudioToken({ login: 'juho', name: 'Juho' }, secret);
  assert.equal((await fetch(base + '/api/versions', { headers: { authorization: `Bearer ${token}`, Origin: 'https://bad.example' } })).status, 403);
  const response = await fetch(base + '/api/export', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ vector: 'old' }) });
  assert.equal(response.status, 409);
  const socket = new WS(base.replace('http', 'ws') + '/sync/althea-uusi', [`althea-auth.${token}`], { headers: { Origin: 'https://bad.example' } });
  await new Promise(resolve => { socket.on('error', resolve); socket.on('unexpected-response', (_, response) => { assert.equal(response.statusCode, 401); response.resume(); socket.terminate(); resolve(); }); });
});

test('store refuses incompatible layouts and malformed shared updates without losing content', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-store-'));
  const prepared = prepareTemplate(await readFile(new URL('../../site/index.html', import.meta.url), 'utf8'));
  const store = new StudioStore(directory, prepared.manifest, prepared.template);
  const initial = vector(store.doc), bad = new Y.Doc(); bad.getMap('unknown').set('x', 'y');
  assert.throws(() => store.apply(Y.encodeStateAsUpdate(bad), 'test'), /Unknown field/);
  assert.equal(vector(store.doc), initial);
  assert.throws(() => new StudioStore(directory, prepared.manifest, prepared.template), /running/);
  store.close(); bad.destroy();
  assert.throws(() => new StudioStore(directory, { ...prepared.manifest, layoutHash: 'changed' }, prepared.template), /layout changed/);
  const restored = new StudioStore(directory, prepared.manifest, prepared.template);
  assert.equal(vector(restored.doc), initial); restored.close();
  t.after(() => rm(directory, { recursive: true, force: true }));
});
