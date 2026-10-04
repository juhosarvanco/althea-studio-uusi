import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WS from 'ws';
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { createStudioServer } from '../server.mjs';
import { StudioStore, vector } from '../store.mjs';
import { prepareTemplate } from '../template.mjs';
import { schema } from '../schema.mjs';
import { issueStudioToken } from '../../shared/studio-token.mjs';
import { diffWords } from '../diff.mjs';

const secret = 'history-test-only-secret-at-least-32-characters';
const waitFor = async predicate => {
  const deadline = Date.now() + 6000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Synchronization timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
};
function client(server, login) {
  const doc = new Y.Doc(), token = issueStudioToken({ login, name: login }, secret);
  const Socket = class extends WS { constructor(url) { super(url, [`althea-auth.${token}`], { headers: { Origin: `http://127.0.0.1:${server.port}` } }); } };
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/sync`, 'althea-uusi', doc, { WebSocketPolyfill: Socket, disableBc: true });
  provider.messageHandlers[4] = () => {};
  const api = async (path, body) => fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { doc, provider, api, close: () => { provider.destroy(); doc.destroy(); } };
}
const content = (doc, id) => yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(id));

test('field history records signed-in authors, groups typing, restores only one field and rejects stale restores', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-field-history-'));
  let server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  const a = client(server, 'juho'), b = client(server, 'julia');
  t.after(async () => { a.close(); b.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => a.provider.synced && b.provider.synced);
  const id = 'kokemus-lyhyesti-h2-1', other = 'kokemus-lyhyesti-p-1';
  const initial = server.store.fieldHistory(id), baseline = initial.entries[0];
  assert.equal(baseline.author, null);
  const text = a.doc.getXmlFragment(id).get(0).get(0);
  a.provider.awareness.setLocalStateField('user', { name: 'Someone else', color: '#000000' });
  text.insert(0, 'Ensimmäinen. ');
  await waitFor(() => server.store.fieldHistory(id).current.text.startsWith('Ensimmäinen.'));
  const first = server.store.fieldHistory(id).entries[0];
  assert.equal(first.author.login, 'juho'); assert.equal(first.author.name, 'juho');
  text.insert(0, 'Toinen. ');
  await waitFor(() => server.store.fieldHistory(id).current.text.startsWith('Toinen.'));
  const grouped = server.store.fieldHistory(id).entries[0];
  assert.equal(grouped.id, first.id); assert.equal(grouped.before.text, initial.current.text);
  assert.equal(grouped.after.text, 'Toinen. Ensimmäinen. ' + initial.current.text);
  // An unrelated field and a comment can change after the history was fetched.
  b.doc.getXmlFragment(other).get(0).get(0).insert(0, 'Julian muu kohta. ');
  b.doc.getMap('comments').set('keep-comment', { fieldId: id, body: 'Säilytä kommentti', author: 'julia', createdAt: new Date().toISOString(), resolved: false });
  await waitFor(() => server.store.doc.getMap('comments').has('keep-comment') && server.store.fieldHistory(other).current.text.startsWith('Julian'));
  const otherContent = content(server.store.doc, other);
  const response = await a.api('/api/field-restore', { fieldId: id, id: baseline.id, expectedHash: grouped.after.hash, versionHash: baseline.after.hash });
  assert.equal(response.status, 200);
  await waitFor(() => vector(b.doc) === vector(server.store.doc));
  assert.equal(server.store.fieldHistory(id).current.text, initial.current.text);
  assert.deepEqual(content(b.doc, other), otherContent); assert.ok(b.doc.getMap('comments').has('keep-comment'));
  const restored = server.store.fieldHistory(id).entries[0];
  assert.equal(restored.kind, 'restore'); assert.equal(restored.author.login, 'juho');
  assert.equal(restored.before.text, grouped.after.text);
  // Restoring an overwritten text remains possible from its earlier audit entry.
  assert.equal((await a.api('/api/field-restore', { fieldId: id, id: grouped.id, expectedHash: initial.current.hash, versionHash: grouped.after.hash })).status, 200);
  await waitFor(() => vector(a.doc) === vector(server.store.doc));
  const beforeDeletion = server.store.fieldHistory(id);
  const bText = b.doc.getXmlFragment(id).get(0).get(0);
  bText.delete(0, 1);
  await waitFor(() => server.store.fieldHistory(id).current.hash !== beforeDeletion.current.hash);
  assert.equal(server.store.fieldHistory(id).entries[0].author.login, 'julia');
  assert.equal((await a.api('/api/field-restore', { fieldId: id, id: baseline.id, expectedHash: beforeDeletion.current.hash, versionHash: baseline.after.hash })).status, 409);
  assert.equal((await a.api('/api/field-restore', { fieldId: id, id: baseline.id, expectedHash: server.store.fieldHistory(id).current.hash, versionHash: 'wrong-version' })).status, 409);
  assert.equal((await a.api('/api/field-history?fieldId=unknown')).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/field-history?fieldId=${id}`)).status, 401);
  const beforeRestart = server.store.fieldHistory(id);
  a.close(); b.close(); await server.close();
  await appendFile(join(directory, 'updates.bin'), Buffer.from([0, 0, 0, 10, 1, 2]));
  server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  assert.deepEqual(server.store.fieldHistory(id), beforeRestart);
  assert.deepEqual(content(server.store.doc, other), otherContent);
});

test('legacy journals and snapshots migrate without losing shared state, formatting or comments', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-legacy-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const prepared = prepareTemplate('<html><head></head><body><main><section id="test"><h1>Otsikko</h1><p>Vanha <strong>lihavoitu</strong> <a href="/yhteys">linkki</a>.</p></section></main></body></html>');
  let store = new StudioStore(directory, prepared.manifest, prepared.template);
  const id = 'test-p-1', original = content(store.doc, id);
  const text = store.doc.getXmlFragment(id).get(0).get(0); text.insert(0, 'Muokattu. ');
  store.doc.getMap('comments').set('legacy-comment', { fieldId: id, body: 'Vanha kommentti', author: 'Julia', createdAt: new Date().toISOString(), resolved: false });
  store.checkpoint('Julian tallentama versio', 'Julia');
  const revision = vector(store.doc), update = Y.encodeStateAsUpdate(store.doc);
  const header = Buffer.alloc(36); header.writeUInt32BE(update.length); createHash('sha256').update(update).digest().copy(header, 4);
  store.close(); await writeFile(join(directory, 'updates.bin'), Buffer.concat([header, update]));
  store = new StudioStore(directory, prepared.manifest, prepared.template);
  assert.equal(vector(store.doc), revision); assert.ok(store.comments.has('legacy-comment'));
  const history = store.fieldHistory(id);
  assert.equal(history.entries.length, 2); assert.ok(history.entries.every(entry => entry.author === null));
  assert.ok(history.entries[0].after.html.includes('<strong>lihavoitu</strong>'));
  const old = history.entries.at(-1);
  store.restoreField(id, old.id, history.current.hash, old.after.hash, { sub: 'juho', name: 'Juho' });
  assert.equal(JSON.stringify(content(store.doc, id)), JSON.stringify(original));
  assert.ok(store.comments.has('legacy-comment'));
  assert.equal(store.fieldHistory(id).entries[0].author.name, 'Juho');
  const persisted = store.fieldHistory(id); store.close();
  store = new StudioStore(directory, prepared.manifest, prepared.template);
  assert.deepEqual(store.fieldHistory(id), persisted);
  // Schema/markup validation also applies to historical text restorations.
  const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(store.doc));
  const fragment = candidate.getXmlFragment(id); fragment.delete(0, fragment.length);
  prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }] }, fragment);
  store.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(store.doc)), null, { sub: 'julia', name: 'Julia' });
  assert.ok(store.fieldHistory(id).entries[0].after.html.includes('&lt;script&gt;'));
  assert.ok(!store.fieldHistory(id).entries[0].after.html.includes('<script>'));
  candidate.destroy(); store.close();
});

test('word comparison reconstructs both versions including whitespace, empty text and long passages', () => {
  for (const [before, after] of [['vanha teksti', 'uusi teksti'], ['', 'uusi'], ['poistetaan', ''],
    ['sama\nrivi', 'sama\nuusi rivi'], ['a & <b>', 'a & <i>'], ['a '.repeat(2000), 'b '.repeat(2000)]]) {
    const parts = diffWords(before, after);
    assert.equal(parts.filter(part => part.kind !== 'add').map(part => part.text).join(''), before);
    assert.equal(parts.filter(part => part.kind !== 'remove').map(part => part.text).join(''), after);
  }
});
