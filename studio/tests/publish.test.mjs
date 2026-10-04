import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { StudioStore, vector } from '../store.mjs';
import { prepareTemplate } from '../template.mjs';
import { GithubPublisher, REPOSITORY, githubRequest } from '../publish.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
async function setup(t, baselineChanged = false) {
  const directory = await mkdtemp(join(tmpdir(), 'new-studio-publication-'));
  const source = '<!doctype html><html><head></head><body><main><section id="alku"><h1>Alkuperäinen otsikko</h1></section></main></body></html>';
  const prepared = prepareTemplate(source), store = new StudioStore(join(directory, 'data'), prepared.manifest, prepared.template);
  await writeFile(join(directory, 'index.html'), source);
  t.after(async () => { store.close(); await rm(directory,{recursive:true,force:true}); });
  const calls = [];
  const request = async (path, body, method) => {
    calls.push({path,body,method}); assert.ok(path.startsWith(`/repos/${REPOSITORY}/`));
    if(path.includes('/git/ref/heads/'))return {object:{sha:'parent'}};
    if(path.includes('/contents/'))return {encoding:'base64',content:Buffer.from(baselineChanged?'external edit':source).toString('base64')};
    if(path.endsWith('/git/commits/parent'))return {tree:{sha:'base-tree'}};
    if(path.endsWith('/git/trees'))return {sha:'next-tree'};
    if(path.endsWith('/git/commits'))return {sha:'next-commit'};
    if(path.includes('/git/refs/heads/'))return {};
    throw Error('Unexpected request');
  };
  const publisher = new GithubPublisher({store,media:{publicationAssets:()=>[]},site:directory,request});
  return {store,publisher,calls,directory};
}
test('publication targets only the new repo, checks the public baseline and never force-updates the branch', async t => {
  const {store,publisher,calls,directory} = await setup(t);
  const snapshot = store.export();
  const result = await publisher.publish({vector:vector(store.doc),layoutHash:snapshot.layoutHash},{sub:'juhosarvanco',name:'Juho'});
  assert.equal(result.baselineUpdated,true);
  const tree = calls.find(call=>call.path.endsWith('/git/trees')).body;
  assert.equal(tree.tree[0].path,'site/index.html'); assert.equal(tree.tree[0].content,snapshot.html);
  const update = calls.find(call=>call.path.includes('/git/refs/heads/'));
  assert.equal(update.method,'PATCH'); assert.equal(update.body.force,false);
  assert.equal(store.export().publicHash,digest(snapshot.html));
  assert.equal(await readFile(join(directory,'index.html'),'utf8'),snapshot.html);
  assert.throws(() => githubRequest('/repos/juhosarvanco/althea-website/git/ref/heads/main'),/restricted/);
});
test('stale drafts and outside GitHub edits preserve the shared draft and prevent publication', async t => {
  const {store,publisher,calls} = await setup(t,true); const snapshot=store.export();
  await assert.rejects(publisher.publish({vector:'stale',layoutHash:snapshot.layoutHash},{sub:'julia',name:'Julia'}),error=>error.status===409);
  assert.equal(calls.length,0);
  await assert.rejects(publisher.publish({vector:vector(store.doc),layoutHash:'stale-layout'},{sub:'julia',name:'Julia'}),error=>error.status===409);
  assert.equal(calls.length,0);
  await assert.rejects(publisher.publish({vector:vector(store.doc),layoutHash:snapshot.layoutHash},{sub:'julia',name:'Julia'}),error=>error.status===409);
  assert.equal(calls.length,2); assert.deepEqual(store.export(),snapshot);
});
test('typing that arrives during publication remains in the shared document for the next publication', async t => {
  const {store,publisher,calls} = await setup(t);
  const originalRequest=publisher.request;
  publisher.request=async(path,body,method)=>{
    if(path.endsWith('/git/trees')) {
      const candidate=new Y.Doc(); Y.applyUpdate(candidate,Y.encodeStateAsUpdate(store.doc));
      const text=candidate.getXmlFragment(store.manifest.fields[0].id).get(0).get(0); text.insert(text.length,' Julian uusi teksti.');
      store.apply(Y.encodeStateAsUpdate(candidate,Y.encodeStateVector(store.doc)),null,{sub:'juliagrahn',name:'Julia'}); candidate.destroy();
    }
    return originalRequest(path,body,method);
  };
  const before=store.export(); await publisher.publish({vector:before.vector,layoutHash:before.layoutHash},{sub:'juhosarvanco',name:'Juho'});
  assert.ok(store.export().html.includes('Julian uusi teksti.'));
  assert.ok(!calls.find(call=>call.path.endsWith('/git/trees')).body.tree[0].content.includes('Julian uusi teksti.'));
  assert.equal(store.export().publicHash,digest(before.html));
});
