import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import WS from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { parseHTML } from 'linkedom';
import { createStudioServer } from '../server.mjs';
import { issueStudioToken } from '../../shared/studio-token.mjs';
import { vector } from '../store.mjs';
import { assetPath, rewriteAssets } from '../../shared/site-assets.mjs';
import { studioLanguage, contentPath, studioRoom } from '../config.js';

const secret = 'bilingual-test-secret-over-thirty-two-characters';
const origin = 'https://www.althea.fi';
const picture = Buffer.from('UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoMAAgAAUAiJYgCdAF1AAD+8dvAB/i37R/e2FAA', 'base64');
async function waitFor(predicate) {
  const deadline = Date.now() + 6000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Language synchronization timed out'); await new Promise(r => setTimeout(r, 20)); }
}
function client(server, language, login) {
  const doc = new Y.Doc(), token = issueStudioToken({ login, name: login }, secret);
  const Socket = class extends WS { constructor(url) { super(url, [`althea-auth.${token}`], { headers: { Origin: origin } }); } };
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/sync`, studioRoom(language), doc, { WebSocketPolyfill: Socket, disableBc: true });
  for (const type of [4, 5, 6]) provider.messageHandlers[type] = () => {};
  return { doc, provider, close() { provider.destroy(); doc.destroy(); } };
}

test('English clients share edits, comments, images and history independently of Finnish, including after restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-languages-'));
  const options = { port: 0, secret, dataDir: directory, allowed: ['juho', 'julia'], origins: [origin], login: { check() {} } };
  let server = await createStudioServer(options);
  const fi = client(server, 'fi', 'juho'), en = client(server, 'en', 'julia'), enPeer = client(server, 'en', 'juho');
  t.after(async () => { fi.close(); en.close(); enPeer.close(); await server.close(); await rm(directory, { recursive: true, force: true }); });
  await waitFor(() => [fi, en, enPeer].every(c => c.provider.synced));
  const finnish = server.store.export();
  const english = server.contexts.get('en').store;
  const field = english.manifest.fields.find(f => f.tag === 'h1').id;
  const text = en.doc.getXmlFragment(field).get(0).get(0);
  text.insert(0, 'English review. ');
  en.doc.getMap('comments').set('english-comment', { fieldId: field, body: 'Review this translation.', author: 'Julia', createdAt: new Date().toISOString(), resolved: false });
  await waitFor(() => vector(enPeer.doc) === vector(english.doc) && english.export().html.includes('English review. '));
  assert.deepEqual(server.store.export(), finnish);
  assert.equal(fi.doc.getMap('comments').has('english-comment'), false);
  assert.equal(english.fieldHistory(field).entries[0].author.login, 'julia');
  const headers = { authorization: `Bearer ${issueStudioToken({ login: 'julia', name: 'Julia' }, secret)}`, Origin: origin };
  const request = async (path, body, extra = {}) => fetch(`http://127.0.0.1:${server.port}${path}`, {
    headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}), ...extra.headers },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), ...extra
  });
  assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/en/layout`)).status, 401);
  const layout = await (await request('/api/en/layout')).json();
  assert.ok(layout.html.includes('lang="en"'));
  assert.equal(layout.fields.length, english.manifest.fields.length);
  assert.ok(!(await (await request('/api/layout')).json()).html.includes('English review. '));
  const checkpoint = await (await request('/api/en/checkpoint', { title: 'English review', vector: vector(english.doc) })).json();
  assert.ok(checkpoint.id);
  assert.ok(!server.store.versions().some(v => v.title === 'English review'));
  const upload = await request('/api/en/media-upload?name=english.webp', null, { method: 'POST', headers, body: picture });
  assert.equal(upload.status, 200); const { entry } = await upload.json();
  assert.equal(server.media.list().some(i => i.id === entry.id), false);
  const bank = await (await request('/api/en/media')).json();
  assert.ok(bank.images.length >= 8);
  const slot = bank.slots.find(s => s.kind === 'background');
  assert.equal((await request('/api/en/media-assign', { nodeId: slot.id, imageHash: slot.imageHash, mediaId: entry.id, alt: 'English room', position: '50% 40%' })).status, 200);
  const exported = await (await request('/api/en/export', { vector: vector(english.doc) })).json();
  assert.ok(exported.html.includes(`src="../${entry.path}"`));
  assert.ok(exported.html.includes('English review. '));
  assert.deepEqual(exported.assets, [{ path: entry.path, digest: entry.id, content: picture.toString('base64') }]);
  assert.deepEqual(server.store.export(), finnish);
  assert.equal((await request('/api/en/local-layout')).status, 403);
  assert.equal((await request('/api/fr/layout')).status, 404);
  const englishBefore = english.export(), historyBefore = english.fieldHistory(field);
  fi.close(); en.close(); enPeer.close();
  await server.close(); server = await createStudioServer(options);
  assert.deepEqual(server.contexts.get('en').store.export(), englishBefore);
  assert.deepEqual(server.contexts.get('en').store.fieldHistory(field), historyBefore);
  assert.equal(server.contexts.get('en').store.comments.get('english-comment').body, 'Review this translation.');
  assert.ok(server.contexts.get('en').store.versions().some(v => v.title === 'English review'));
  assert.deepEqual(server.contexts.get('en').media.read(entry.id), picture);
  assert.deepEqual(server.store.export(), finnish);
});

test('language routing and shared asset URLs resolve correctly from both editor depths without public language controls', async t => {
  const previous = globalThis.location; t.after(() => globalThis.location = previous);
  for (const [pathname, language] of [['/studio/', 'fi'], ['/en/studio/', 'en'], ['/althea-studio-uusi/en/studio/', 'en']]) {
    globalThis.location = { pathname };
    assert.equal(studioLanguage(), language);
    assert.equal(contentPath('/api/media-file/abc'), language === 'en' ? '/api/en/media-file/abc' : '/api/media-file/abc');
    assert.equal(studioRoom(), language === 'en' ? 'althea-uusi-en' : 'althea-uusi');
  }
  for (const value of ['assets/img/a.webp', '../assets/img/a.webp', '/assets/img/a.webp']) assert.equal(assetPath(value), 'assets/img/a.webp');
  assert.equal(assetPath('../../assets/private'), null);
  assert.equal(rewriteAssets('../assets/a.webp 1x, ../assets/b.webp 2x', '/'), '/assets/a.webp 1x, /assets/b.webp 2x');
  assert.equal(rewriteAssets("url('../assets/font.woff2')", '../../'), "url('../../assets/font.woff2')");
  for (const [language, prefix] of [['fi', '../'], ['en', '../../']]) {
    const page = language === 'en' ? 'en/' : '';
    const { document } = parseHTML(await readFile(new URL(`../../site/${page}studio/index.html`, import.meta.url), 'utf8'));
    assert.equal(document.querySelector('#studio-language option[selected]').getAttribute('value'), language);
    assert.equal(document.querySelector('meta[name="robots"]').content.replace(/\s/g, ''), 'noindex,nofollow');
    assert.ok(document.querySelector('script[src]').getAttribute('src').startsWith(prefix + 'studio/'));
    for (const image of document.querySelectorAll('img[src]')) assert.ok(image.getAttribute('src').startsWith(prefix + 'assets/'));
    const { document: publicPage } = parseHTML(await readFile(new URL(`../../site/${page}index.html`, import.meta.url), 'utf8'));
    assert.equal(publicPage.querySelector('#studio-language'), null);
  }
});

test('new language drafts copy the current content safely and retain independent history after restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-new-language-'));
  const options = { port: 0, secret, dataDir: directory, allowed: ['juho'], origins: [origin], login: { check() {} } };
  let server = await createStudioServer(options);
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const headers = { authorization: `Bearer ${issueStudioToken({login:'juho',name:'Juho'},secret)}`, Origin: origin, 'content-type':'application/json' };
  const request = (path, body, overrides={}) => fetch(`http://127.0.0.1:${server.port}${path}`,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{}),...overrides});
  const fiBefore = server.store.export(), enBefore = server.contexts.get('en').store.export();
  assert.equal((await request('/api/add-language',{code:'sv',vector:'stale'})).status,409);
  assert.equal((await request('/api/add-language',{code:'zz',vector:fiBefore.vector})).status,400);
  assert.equal((await request('/api/add-language',{code:'sv',vector:fiBefore.vector},{headers:{...headers,Origin:'https://wrong.example'}})).status,403);
  assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/languages`)).status,401);
  const added=await request('/api/add-language',{code:'sv',vector:fiBefore.vector});assert.equal(added.status,200);
  const swedish=server.contexts.get('sv').store;
  assert.match(swedish.export().html,/lang="sv"/);
  assert.ok(!swedish.export().html.includes('noindex, nofollow'));
  assert.match(swedish.export().html,/\.\.\/assets\//);
  assert.equal(swedish.comments.size,0);
  assert.equal((await request('/api/add-language',{code:'sv',vector:fiBefore.vector})).status,422);
  assert.deepEqual(server.store.export(),fiBefore);assert.deepEqual(server.contexts.get('en').store.export(),enBefore);
  const sv=client(server,'sv','juho');await waitFor(()=>sv.provider.synced);
  const field=swedish.manifest.fields.find(f=>f.tag==='h1').id;
  sv.doc.getXmlFragment(field).get(0).get(0).insert(0,'Svenska: ');
  sv.doc.getMap('comments').set('sv-comment',{fieldId:field,body:'Svensk kommentar',author:'Juho',createdAt:new Date().toISOString(),resolved:false,position:{x:.3,y:.4}});
  await waitFor(()=>vector(sv.doc)===vector(swedish.doc));sv.close();
  const snapshot=swedish.export(),history=swedish.fieldHistory(field);
  assert.equal((await request('/api/sv/layout')).status,200);
  assert.equal((await (await request('/api/languages')).json()).languages.find(l=>l.code==='sv').draft,true);
  await server.close();server=await createStudioServer(options);
  assert.deepEqual(server.contexts.get('sv').store.export(),snapshot);
  assert.deepEqual(server.contexts.get('sv').store.fieldHistory(field),history);
  assert.deepEqual(server.contexts.get('sv').store.comments.get('sv-comment').position,{x:.3,y:.4});
  assert.deepEqual(server.store.export(),fiBefore);
  // Unregistered data must never be removed by failed language creation.
  const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(join(directory,'de'));await writeFile(join(directory,'de','keep.txt'),'retain');
  assert.equal((await request('/api/add-language',{code:'de',vector:fiBefore.vector})).status,409);
  assert.equal(await readFile(join(directory,'de','keep.txt'),'utf8'),'retain');
});

test('query-selected languages use isolated API and websocket rooms',()=>{
 const before=globalThis.location;try{globalThis.location={pathname:'/studio/',search:'?lang=sv'};assert.equal(studioLanguage(),'sv');assert.equal(contentPath('/api/layout'),'/api/sv/layout');assert.equal(studioRoom(),'althea-uusi-sv');}finally{globalThis.location=before;}
});
