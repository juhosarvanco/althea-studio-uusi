import {validLanguage,languageName} from '../vendor/studio-ui/languages.mjs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepareTemplate } from '../studio/template.mjs';
import { rewriteAssets } from '../shared/site-assets.mjs';
import { studioAddress } from '../shared/studio-address.mjs';
import { studioPolicy } from '../studio/security.mjs';
import { applySiteIcons } from '../shared/site-icons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// A release must never accidentally point visitors at localhost or a LAN IP.
if (process.env.GITHUB_ACTIONS) studioAddress(process.env.STUDIO_SERVER_URL);
let relay = process.env.STUDIO_RELAY_URL;
if (!relay && !process.env.GITHUB_ACTIONS) {
  try { relay = JSON.parse(await readFile(join(root, '.studio-live/relay.json'), 'utf8')).url; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (relay) relay = studioAddress(relay);
// Bundle the shared gallery controls into the public page's deferred script.
// A separate async import allowed the first arrow click to arrive too early.
await build({ entryPoints: [join(root, 'tools/public-app.js')], bundle: true, format: 'iife',
  outfile: join(root, 'site/app.js'), target: ['es2022'],
  loader: { '.css': 'text' },
  banner: { js: '// Generated from tools/public-app.js and site/gallery.js. Edit those sources and run npm run build.' } });
// Relative links work both under the repository path and on the custom domain.
const base = process.env.STUDIO_BASE_PATH || '../';
if (!/^\/[a-zA-Z0-9_/-]*\/$/.test(base) && !['/', '../'].includes(base)) throw new Error('Invalid site base path');
// Fingerprinted URLs keep a cached old editor bundle from running against new chrome.
const studioDirectory=join(root,'site/studio');await mkdir(studioDirectory,{recursive:true});
await build({entryPoints:[join(root,'studio/client.js')],bundle:true,format:'esm',minify:true,outfile:join(studioDirectory,'client.js'),target:['es2022']});
const studioAssets={'client.js':await readFile(join(studioDirectory,'client.js')),'studio.css':await readFile(join(root,'studio/studio.css')),'ui.css':await readFile(join(root,'vendor/studio-ui/ui.css')),'workspace.css':await readFile(join(root,'studio/workspace.css'))};
const assetURL=(name,prefix)=>prefix+'studio/'+name+'?v='+createHash('sha256').update(studioAssets[name]).digest('hex').slice(0,16);
for(const [name,bytes] of Object.entries(studioAssets))if(name!=='client.js')await writeFile(join(studioDirectory,name),bytes);
const extras=(await readdir(join(root,'site'),{withFileTypes:true})).filter(item=>item.isDirectory()&&validLanguage(item.name)&&!['fi','en'].includes(item.name)).map(item=>item.name);
for (const language of ['fi','en',...extras]) {
  const page = language==='fi'?'':language+'/';
  const editorBase = language !== 'fi' && base === '../' ? '../../' : base;
  const { document, manifest, template } = prepareTemplate(await readFile(join(root, `site/${page}index.html`), 'utf8'));
  // Keep hash navigation on the editor while resolving both languages' assets
  // from the public site root, including srcset and embedded font styles.
  for (const el of document.querySelectorAll('[src], [href], [srcset]')) {
    for (const name of ['src', 'href', 'srcset']) {
      const value = el.getAttribute(name);
      if (value) el.setAttribute(name, rewriteAssets(value, editorBase));
      if (name === 'href' && ['original.html', 'studio/'].includes(value)) el.setAttribute(name, editorBase + value);
    }
  }
  for (const style of document.querySelectorAll('style')) style.textContent = rewriteAssets(style.textContent, editorBase);
  document.title = `Althea Studio — ${languageName(language)}`;
  applySiteIcons(document, editorBase);
  document.documentElement.setAttribute('data-studio-language', language);
  document.querySelectorAll('script:not([type="application/json"])').forEach(el => el.remove());
  document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(el => el.remove());
  const policy = document.createElement('meta'); policy.setAttribute('http-equiv', 'Content-Security-Policy');
  policy.content = studioPolicy(process.env.STUDIO_SERVER_URL || 'http://127.0.0.1:8796', relay);
  document.head.insertBefore(policy, document.head.firstChild);
  const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer'; document.head.append(referrer);
  document.querySelectorAll('head style').forEach(el => el.setAttribute('data-studio-site-style', ''));
  const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow'; document.head.append(robots);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = assetURL('studio.css',editorBase); document.head.append(css);
  for(const path of ['ui.css','workspace.css']){const css=document.createElement('link');css.rel='stylesheet';css.href=assetURL(path,editorBase);document.head.append(css);}
  document.body.insertAdjacentHTML('beforeend', await readFile(join(root, 'studio/chrome.html'), 'utf8'));
  document.querySelector('.studio-brand span').textContent = 'Studio';
  document.querySelector('#studio-canvas-label').textContent = `${languageName(language)} · yhteinen työversio`;
  // linkedom does not implement select.value consistently; write the selected
  // option explicitly so the right language is visible before JS starts.
  if(!document.querySelector(`#studio-language option[value="${language}"]`)){const option=document.createElement('option');option.value=language;option.textContent=languageName(language);document.querySelector('#studio-language').append(option);}
  document.querySelector(`#studio-language option[value="${language}"]`).setAttribute('selected','');
  // The language selector identifies the publication target; keep the button compact.
  document.querySelector('.studio-back').setAttribute('href', '../');
  const script = document.createElement('script'); script.type = 'module'; script.src = assetURL('client.js',editorBase); document.body.append(script);
  const directory = join(root, `site/${page}studio`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), '<!doctype html>\n' + document.documentElement.outerHTML);
  await writeFile(join(directory, 'template.html'), template);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Studio built (${language}): ${manifest.fields.length} shared text fields.`);
}
await writeFile(join(root, 'site/studio/config.json'), JSON.stringify({ server: process.env.STUDIO_SERVER_URL || 'http://127.0.0.1:8796', ...(relay ? { relay } : {}) }) + '\n');
