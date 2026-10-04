import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as Y from 'yjs';
import WS from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { parseHTML } from 'linkedom';
import { StudioStore, vector } from '../store.mjs';
import { createStudioServer } from '../server.mjs';
import { prepareTemplate } from '../template.mjs';
import { issueStudioToken } from '../../shared/studio-token.mjs';
const secret = 'layout-test-only-secret-at-least-32-characters';
const waitFor = async predicate => {
  const until = Date.now() + 7000;
  while (!predicate()) { if (Date.now() > until) throw new Error('Layout synchronization timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
};
function client(server, login) {
  const doc = new Y.Doc(), token = issueStudioToken({ login, name: login }, secret), notices = [];
  const Socket = class extends WS { constructor(url) { super(url, [`althea-auth.${token}`], { headers: { Origin: `http://127.0.0.1:${server.port}` } }); } };
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/sync`, 'althea-uusi', doc, { WebSocketPolyfill: Socket, disableBc: true });
  provider.messageHandlers[4] = () => {};
  provider.messageHandlers[5] = (_, decoder) => notices.push(JSON.parse(new TextDecoder().decode(decoding.readVarUint8Array(decoder))));
  provider.on('status', event => { if (event.status === 'connected') { const e = encoding.createEncoder(); encoding.writeVarUint(e, 5); provider.ws.send(encoding.toUint8Array(e)); } });
  return { doc, provider, notices, token, close: () => { provider.destroy(); doc.destroy(); } };
}
const text = (doc, id) => doc.getXmlFragment(id).get(0).get(0);
const plain = (doc, id) => doc.getXmlFragment(id).toString();
const source = '<html lang="fi"><head><style>p{color:#333}</style></head><body><main><section id="one"><h2>Ensimmäinen</h2><p>Alkuperäinen teksti.</p><p>Poistettava teksti.</p></section><section id="two"><h2>Toinen</h2><p>Toinen teksti.</p></section></main><footer><p>Alatunniste</p></footer></body></html>';

test('live layout moves stable fields, seeds new fields once and archives removed fields with their history and late edits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-live-layout-'));
  let server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  const a = client(server, 'juho'), b = client(server, 'julia');
  t.after(async () => { a.close(); b.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => a.provider.synced && b.provider.synced && a.notices.length && b.notices.length);
  const id = 'kokemus-lyhyesti-h2-1', removed = 'kokemus-lyhyesti-p-1';
  const initialLayout = server.store.manifest.layoutHash;
  const baseline = server.store.fieldHistory(id), xml = text(b.doc, id);
  b.doc.getMap('comments').set('moving-comment', { fieldId: removed, body: 'Kommentti säilyy', author: 'julia', createdAt: new Date().toISOString(), resolved: false });
  await waitFor(() => server.store.comments.has('moving-comment'));
  const beforeMove = server.store.checkpoint('Ennen siirtoa', 'Juho');
  const relative = Y.createRelativePositionFromTypeIndex(xml, 3);
  // Julia keeps writing while disconnected, including into a removed field.
  b.provider.disconnect();
  xml.insert(0, 'Julian keskeneräinen alku. ');
  text(b.doc, removed).insert(0, 'Arkistoon myöhemmin saapuva muutos. ');
  const { document } = parseHTML(server.store.export().html);
  const section = document.querySelector('#kokemus-lyhyesti');
  document.querySelector('#ohjelma').append(section);
  section.querySelector(`[data-studio-field="${removed}"]`).remove();
  const p = document.createElement('p'); p.textContent = 'Uuden alueen ensimmäinen teksti.'; section.append(p);
  const result = server.store.applyLayout('<!doctype html>\n' + document.documentElement.outerHTML, initialLayout, { sub: 'juho', name: 'Juho' });
  assert.equal(result.added.length, 1); assert.ok(result.archived.includes(removed));
  assert.equal(server.store.fieldHistory(id).current.text, baseline.current.text);
  assert.deepEqual(server.store.fieldHistory(id).entries, baseline.entries);
  await waitFor(() => a.notices.some(notice => notice.layoutHash === result.layoutHash));
  b.provider.connect();
  await waitFor(() => vector(b.doc) === vector(server.store.doc) && plain(a.doc, id).includes('Julian keskeneräinen'));
  assert.ok(plain(server.store.doc, removed).includes('Arkistoon myöhemmin'));
  assert.equal(server.store.fieldHistory(removed).entries[0].author.login, 'julia');
  assert.ok(server.store.comments.has('moving-comment'));
  const cursor = Y.createAbsolutePositionFromRelativePosition(relative, b.doc);
  assert.equal(cursor.type, xml); assert.equal(cursor.index, 3 + 'Julian keskeneräinen alku. '.length);
  assert.ok(server.store.export().html.includes('Julian keskeneräinen'));
  assert.ok(!server.store.export().html.includes('Arkistoon myöhemmin'));
  assert.ok(plain(a.doc, result.added[0]).includes('Uuden alueen'));
  assert.throws(() => server.store.restore(beforeMove.id, vector(server.store.doc), 'Juho'), /Incompatible/);
  // A stale layout cannot overwrite a newer one, even with a fresh text vector.
  assert.throws(() => server.store.applyLayout(document.documentElement.outerHTML, initialLayout), /Rakenne muuttui/);
  const archivedHistory = server.store.fieldHistory(removed), revision = vector(server.store.doc);
  a.close(); b.close(); await server.close();
  await appendFile(join(directory, 'updates.bin'), Buffer.from([0, 0, 0, 20, 1, 2]));
  server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  assert.equal(server.store.manifest.layoutHash, result.layoutHash); assert.equal(vector(server.store.doc), revision);
  assert.deepEqual(server.store.fieldHistory(removed), archivedHistory);
  assert.ok(server.store.comments.has('moving-comment'));
  // Reintroducing a field uses its latest archived text, never a stale seed.
  const restoredPage = parseHTML(server.store.export().html).document;
  const restored = restoredPage.createElement('p'); restored.dataset.studioField = removed; restored.textContent = 'Älä korvaa tällä.';
  restoredPage.querySelector('#kokemus-lyhyesti').append(restored);
  server.store.applyLayout(restoredPage.documentElement.outerHTML, result.layoutHash, { sub: 'juho', name: 'Juho' });
  assert.ok(server.store.export().html.includes('Arkistoon myöhemmin'));
  assert.ok(!server.store.export().html.includes('Älä korvaa tällä.'));
});

test('layout updates preserve text identity and undo, reject duplicate IDs and keep metadata server-owned', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-layout-store-'));
  const prepared = prepareTemplate(source), store = new StudioStore(directory, prepared.manifest, prepared.template);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const id = 'one-p-1', field = text(store.doc, id), origin = {}, undo = new Y.UndoManager(store.doc.getXmlFragment(id), { trackedOrigins: new Set([origin]) });
  // This direct mutation is only a test of CRDT identity across layout updates.
  store.doc.transact(() => field.insert(0, 'Oma lisäys. '), origin);
  const page = parseHTML(prepared.template).document;
  page.querySelector('#two').append(page.querySelector(`[data-studio-field="${id}"]`));
  page.querySelector(`[data-studio-field="${id}"]`).textContent = 'Vanha tiedostoteksti ei korvaa yhteistä tekstiä.';
  const p = page.createElement('p'); p.textContent = 'Uusi ensimmäiseksi.'; page.querySelector('#one').prepend(p);
  const result = store.applyLayout(page.documentElement.outerHTML, prepared.manifest.layoutHash);
  assert.equal(text(store.doc, id), field); assert.ok(plain(store.doc, id).includes('Oma lisäys'));
  assert.notEqual(result.added[0], id); assert.ok(!store.export().html.includes('Vanha tiedostoteksti'));
  undo.undo(); assert.ok(!plain(store.doc, id).includes('Oma lisäys')); undo.destroy();
  const current = store.export();
  const duplicate = parseHTML(current.html).document;
  duplicate.querySelector('#one').append(duplicate.querySelector(`[data-studio-field="${id}"]`).cloneNode(true));
  assert.throws(() => store.applyLayout(duplicate.documentElement.outerHTML, current.layoutHash), /duplicate/);
  assert.throws(() => store.applyLayout(current.html.replace('</body>', '<script>alert(1)</script></body>'), current.layoutHash), /ohjelmakoodin/);
  const changedTag = parseHTML(current.html).document;
  const h2 = changedTag.createElement('h2'); h2.dataset.studioField = id; h2.textContent = 'Väärä tyyppi';
  changedTag.querySelector(`[data-studio-field="${id}"]`).replaceWith(h2);
  assert.throws(() => store.applyLayout(changedTag.documentElement.outerHTML, current.layoutHash), /elementtityyppi/);
  const bad = new Y.Doc(); Y.applyUpdate(bad, Y.encodeStateAsUpdate(store.doc)); bad.getMap('meta').set('publicHash', 'b'.repeat(64));
  const revision = vector(store.doc);
  assert.throws(() => store.apply(Y.encodeStateAsUpdate(bad, Y.encodeStateVector(store.doc)), null), /Server-owned/);
  assert.equal(vector(store.doc), revision); bad.destroy();
});

test('only a trusted local operator can update markup; connected editors can read the live layout', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-layout-api-'));
  const server = await createStudioServer({ port: 0, development: true, secret, dataDir: directory });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.port}`, token = issueStudioToken({ login: 'julia', name: 'Julia' }, secret);
  assert.equal((await fetch(base + '/api/layout')).status, 401);
  assert.equal((await fetch(base + '/api/layout', { headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await fetch(base + '/api/local-layout', { headers: { authorization: `Bearer ${token}` } })).status, 403);
  assert.equal((await fetch(base + '/api/local-layout', { headers: { authorization: `Bearer ${secret}`, 'x-forwarded-for': '1.2.3.4' } })).status, 403);
  assert.equal((await fetch(base + '/api/local-layout', { headers: { authorization: `Bearer ${secret}`, origin: base } })).status, 403);
  const current = await (await fetch(base + '/api/local-layout', { headers: { authorization: `Bearer ${secret}` } })).json();
  const body = { layoutHash: current.layoutHash, html: current.html.replace('--paper:#faf8f4', '--paper:#faf8f5') };
  const response = await fetch(base + '/api/local-layout', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); const result = await response.json();
  assert.notEqual(result.layoutHash, current.layoutHash);
  const journal = await readFile(join(directory, 'updates.bin'));
  assert.ok(journal.includes(Buffer.from('bootstrapHash')));
});
