import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseHTML } from 'linkedom';
import { prepareTemplate, layoutHash } from '../template.mjs';
import { StudioStore, vector } from '../store.mjs';
import { relativeCommentPosition } from '../comment-ranges.mjs';
import { initProseMirrorDoc, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { schema } from '../schema.mjs';
const source = '<html><head></head><body><header><a href="#a">Varaa</a></header><main><section id="a"><article><h2>Otsikko</h2><p>Alkuperäinen teksti</p><img src="assets/photo.jpg" alt="Metsä"></article></section><section id="b"><p>Toinen teksti</p></section></main><footer><p>Loppu</p></footer></body></html>';
const comment = anchor => ({ fieldId: anchor.fieldId || null, anchor, body: 'Muokkaustoive', author: 'Julia', createdAt: new Date().toISOString(), resolved: false });
function write(store, change) {
  const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(store.doc)); change(candidate);
  try { store.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(store.doc)), 'test', { sub: 'julia', name: 'Julia' }); }
  finally { candidate.destroy(); }
}
test('page object annotations follow moves, archive removed objects and survive restart without resetting text', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-targets-'));
  const prepared = prepareTemplate(source); let store = new StudioStore(directory, prepared.manifest, prepared.template);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const page = parseHTML(store.export().html).document;
  const article = page.querySelector('article'), image = article.querySelector('img');
  const articleId = article.dataset.studioNode, imageId = image.dataset.studioNode;
  write(store, doc => {
    doc.getMap('comments').set('article', comment({ kind: 'element', nodeId: articleId }));
    doc.getMap('comments').set('image', comment({ kind: 'element', nodeId: imageId }));
    doc.getMap('comments').set('legacy', { ...comment({ kind: 'field', fieldId: 'a-p-1' }), anchor: undefined });
  });
  page.querySelector('#b').append(article); image.remove();
  store.applyLayout(page.documentElement.outerHTML, store.manifest.layoutHash);
  assert.equal(store.layout.targets.find(target => target.id === articleId).archivedAt, null);
  assert.ok(store.layout.targets.find(target => target.id === imageId).archivedAt);
  assert.equal(store.comments.get('image').anchor.nodeId, imageId);
  const revision = vector(store.doc), layout = store.layout; store.close();
  store = new StudioStore(directory, prepared.manifest, prepared.template);
  assert.equal(vector(store.doc), revision); assert.deepEqual(store.layout, layout);
  assert.equal(parseHTML(store.export().html).document.querySelector('article').dataset.studioNode, articleId);
  assert.throws(() => write(store, doc => doc.getMap('comments').set('bad', comment({ kind: 'element', nodeId: 'node-invented' }))), /target/);
  assert.equal(vector(store.doc), revision);
});
test('relative text comments track concurrent insertions and reject a range anchored in another field', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-text-anchor-'));
  const prepared = prepareTemplate(source), store = new StudioStore(directory, prepared.manifest, prepared.template);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const xml = store.doc.getXmlFragment('a-p-1').get(0).get(0);
  const anchor = { kind: 'text', fieldId: 'a-p-1', quote: 'teksti',
    from: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(xml, 13)),
    to: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(xml, 19)) };
  write(store, doc => doc.getMap('comments').set('text', comment(anchor)));
  write(store, doc => doc.getXmlFragment('a-p-1').get(0).get(0).insert(0, 'Julian lisäys. '));
  const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(store.comments.get('text').anchor.from), store.doc);
  assert.equal(start.index, 13 + 'Julian lisäys. '.length);
  const revision = vector(store.doc);
  assert.throws(() => write(store, doc => doc.getMap('comments').set('foreign', comment({ ...anchor, fieldId: 'b-p-1' }))), /another field/);
  assert.throws(() => write(store, doc => doc.getMap('comments').set('invalid', comment({ ...anchor, from: {} }))), /range/);
  assert.equal(vector(store.doc), revision);
  // Deleted text retains the original quote; it is never silently retargeted.
  write(store, doc => doc.getXmlFragment('a-p-1').get(0).get(0).delete(0, 33));
  assert.equal(store.comments.get('text').anchor.quote, 'teksti');
});
test('annotation IDs migrate legacy templates without changing their layout fingerprint', () => {
  const prepared = prepareTemplate(source), legacy = parseHTML(prepared.template).document;
  legacy.querySelectorAll('[data-studio-node]').forEach(el => el.removeAttribute('data-studio-node'));
  assert.equal(layoutHash(legacy.documentElement.outerHTML), prepared.manifest.layoutHash);
  assert.equal(prepareTemplate(legacy.documentElement.outerHTML).manifest.layoutHash, prepared.manifest.layoutHash);
  const duplicate = parseHTML(prepared.template).document;
  duplicate.querySelector('#b').append(duplicate.querySelector('img').cloneNode());
  assert.throws(() => prepareTemplate(duplicate.documentElement.outerHTML), /duplicate page object/);
});
test('browser range boundaries exclude new text inserted immediately before and after the quote', () => {
  const doc = new Y.Doc(), fragment = doc.getXmlFragment('text');
  prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kokemus tarjoaa' }] }] }, fragment);
  const { mapping } = initProseMirrorDoc(fragment, schema);
  const from = relativeCommentPosition(doc, fragment, mapping, 1, 0), to = relativeCommentPosition(doc, fragment, mapping, 8, -1);
  const xml = fragment.get(0).get(0); xml.insert(7, ' jälkeen'); xml.insert(0, 'Ennen: ');
  const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(from), doc);
  const end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(to), doc);
  assert.equal(xml.toString().slice(start.index, end.index), 'Kokemus'); doc.destroy();
});
test('a saved legacy layout gains object targets without changing Yjs revision, field IDs, history or comments', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-legacy-targets-'));
  const prepared = prepareTemplate(source); let store = new StudioStore(directory, prepared.manifest, prepared.template);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  write(store, doc => { doc.getXmlFragment('a-p-1').get(0).get(0).insert(0, 'Julian teksti. ');
    doc.getMap('comments').set('legacy', { ...comment({ kind: 'field', fieldId: 'a-p-1' }), anchor: undefined }); });
  const revision = vector(store.doc), fields = store.fields(), history = store.history.all(), comments = store.comments.toJSON();
  const legacy = { ...store.layout }; delete legacy.targets;
  const page = parseHTML(legacy.template).document; page.querySelectorAll('[data-studio-node]').forEach(el => el.removeAttribute('data-studio-node'));
  legacy.template = page.documentElement.outerHTML;
  const payload = Buffer.from('ALTHEA-AUDIT-1\n' + JSON.stringify({ update: Buffer.from(Y.encodeStateAsUpdate(store.doc)).toString('base64'), changes: history, layout: legacy }));
  const header = Buffer.alloc(36); header.writeUInt32BE(payload.length); createHash('sha256').update(payload).digest().copy(header, 4);
  store.close(); await writeFile(join(directory, 'updates.bin'), Buffer.concat([header, payload]));
  store = new StudioStore(directory, prepared.manifest, prepared.template);
  assert.equal(vector(store.doc), revision); assert.deepEqual(store.fields(), fields);
  assert.deepEqual(store.history.all(), history); assert.deepEqual(store.comments.toJSON(), comments);
  assert.ok(store.layout.targets.length > 0); assert.equal(layoutHash(store.template), prepared.manifest.layoutHash);
});
