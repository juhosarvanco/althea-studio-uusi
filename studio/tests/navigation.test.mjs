import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { parseHTML } from 'linkedom';
import { prepareTemplate, layoutHash } from '../template.mjs';
import { prepareTargets } from '../targets.mjs';
import { StudioStore, vector } from '../store.mjs';
import { enableHeaderEditing } from '../navigation.mjs';

// Reproduce the previous template format, where header links were object
// comment targets but had no editable text fields.
function previousTemplate(source) {
  const prepared = prepareTemplate(source), removed = new Set();
  for (const el of prepared.document.querySelectorAll('header [data-studio-field]')) {
    removed.add(el.getAttribute('data-studio-field'));
    for (const attr of ['data-studio-field', 'oai-annotation-container', 'oai-annotatable', 'oai-annotation-metadata']) el.removeAttribute(attr);
  }
  prepareTargets(prepared.document);
  const template = '<!doctype html>\n' + prepared.document.documentElement.outerHTML;
  return { template, manifest: { ...prepared.manifest, fields: prepared.manifest.fields.filter(field => !removed.has(field.id)), layoutHash: layoutHash(template) } };
}

for (const language of ['fi', 'en']) test(`${language}: existing Studio gains editable desktop and mobile navigation without losing drafts, comments, history or link destinations`, async t => {
  const directory = await mkdtemp(join(tmpdir(), `althea-navigation-${language}-`));
  const source = await readFile(new URL(`../../site/${language === 'en' ? 'en/' : ''}index.html`, import.meta.url), 'utf8');
  const legacy = previousTemplate(source), currentBuild = prepareTemplate(source);
  let store = new StudioStore(directory, legacy.manifest, legacy.template);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const actor = { sub: 'julia', name: 'Julia' }, bodyField = legacy.manifest.fields.find(field => field.tag === 'h1').id;
  const oldPage = parseHTML(store.export().html).document;
  const links = [...oldPage.querySelectorAll('header a')].map(el => ({ node: el.dataset.studioNode, href: el.getAttribute('href'), text: el.textContent }));
  const navigationNode = oldPage.querySelector('header .desktop-nav a').dataset.studioNode;
  const edit = change => {
    const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(store.doc)); change(candidate);
    try { store.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(store.doc)), null, actor); } finally { candidate.destroy(); }
  };
  edit(doc => {
    doc.getXmlFragment(bodyField).get(0).get(0).insert(0, 'Unpublished draft. ');
    doc.getMap('comments').set('navigation-comment', { fieldId: null, anchor: { kind: 'element', nodeId: navigationNode }, body: 'Edit this navigation label.', author: 'Julia', createdAt: new Date().toISOString(), resolved: false });
  });
  const fieldsBefore = store.fields(), historyBefore = store.fieldHistory(bodyField), commentsBefore = store.comments.toJSON();
  const publicHash = store.export().publicHash;
  const disconnected = new Y.Doc(); Y.applyUpdate(disconnected, Y.encodeStateAsUpdate(store.doc));
  const disconnectedVector = Y.encodeStateVector(disconnected);
  disconnected.getXmlFragment(bodyField).get(0).get(0).insert(0, 'Late edit. ');
  const result = enableHeaderEditing(store);
  assert.equal(result.added.length, links.length); assert.deepEqual(result.archived, []);
  for (const [id, content] of Object.entries(fieldsBefore)) assert.deepEqual(store.fields()[id], content);
  assert.deepEqual(store.fieldHistory(bodyField), historyBefore); assert.deepEqual(store.comments.toJSON(), commentsBefore);
  const page = parseHTML(store.export().html).document;
  for (const link of links) {
    const el = page.querySelector(`[data-studio-node="${link.node}"]`);
    assert.ok(el.dataset.studioField); assert.equal(el.getAttribute('href'), link.href); assert.equal(el.textContent, link.text);
    assert.equal(store.layout.targets.find(target => target.id === link.node).archivedAt, null);
  }
  for (const selector of ['header .desktop-nav a', 'header .mobile-menu nav a', 'header .header-cta'])
    assert.ok([...page.querySelectorAll(selector)].every(el => el.dataset.studioField));
  const label = page.querySelector('header .desktop-nav a').dataset.studioField;
  edit(doc => doc.getXmlFragment(label).get(0).get(0).insert(0, 'Updated '));
  store.apply(Y.encodeStateAsUpdate(disconnected, disconnectedVector), null, actor); disconnected.destroy();
  assert.ok(store.export().html.includes('Late edit. Unpublished draft.'));
  const exported = parseHTML(store.export().html).document;
  assert.ok(exported.querySelector('header .desktop-nav a').textContent.startsWith('Updated '));
  assert.equal(exported.querySelector('header .desktop-nav a').getAttribute('href'), links[1].href);
  assert.equal(store.fieldHistory(label).entries[0].author.login, 'julia');
  assert.equal(store.export().publicHash, publicHash);
  const beforeRepeat = vector(store.doc);
  assert.equal(enableHeaderEditing(store).unchanged, true); assert.equal(vector(store.doc), beforeRepeat);
  const saved = store.export(), history = store.fieldHistory(label);
  store.close(); store = new StudioStore(directory, currentBuild.manifest, currentBuild.template);
  assert.equal(enableHeaderEditing(store).unchanged, true);
  assert.deepEqual(store.export(), saved); assert.deepEqual(store.fieldHistory(label), history);
  assert.deepEqual(store.comments.toJSON(), commentsBefore);
});
