import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepareTemplate } from '../studio/template.mjs';
import { rewriteAssets } from '../shared/site-assets.mjs';
import { studioAddress } from '../shared/studio-address.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// A release must never accidentally point visitors at localhost or a LAN IP.
if (process.env.GITHUB_ACTIONS) studioAddress(process.env.STUDIO_SERVER_URL);
// Bundle the shared gallery controls into the public page's deferred script.
// A separate async import allowed the first arrow click to arrive too early.
await build({ entryPoints: [join(root, 'tools/public-app.js')], bundle: true, format: 'iife',
  outfile: join(root, 'site/app.js'), target: ['es2022'],
  banner: { js: '// Generated from tools/public-app.js and site/gallery.js. Edit those sources and run npm run build.' } });
// Relative links work both under the repository path and on the custom domain.
const base = process.env.STUDIO_BASE_PATH || '../';
if (!/^\/[a-zA-Z0-9_/-]*\/$/.test(base) && !['/', '../'].includes(base)) throw new Error('Invalid site base path');
for (const language of ['fi', 'en']) {
  const page = language === 'en' ? 'en/' : '';
  const editorBase = language === 'en' && base === '../' ? '../../' : base;
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
  document.title = `Althea Studio — ${language === 'en' ? 'English' : 'Suomi'}`;
  document.documentElement.setAttribute('data-studio-language', language);
  document.querySelectorAll('script:not([type="application/json"])').forEach(el => el.remove());
  document.querySelectorAll('head style').forEach(el => el.setAttribute('data-studio-site-style', ''));
  const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow'; document.head.append(robots);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = editorBase + 'studio/studio.css'; document.head.append(css);
  document.body.insertAdjacentHTML('beforeend', await readFile(join(root, 'studio/chrome.html'), 'utf8'));
  document.querySelector('.studio-brand span').textContent = `${language === 'en' ? 'English' : 'Suomi'} · yhteinen työversio`;
  // linkedom does not implement select.value consistently; write the selected
  // option explicitly so the right language is visible before JS starts.
  document.querySelector(`#studio-language option[value="${language}"]`).setAttribute('selected', '');
  document.querySelector('#studio-publish').textContent = language === 'en' ? 'Julkaise englanti' : 'Julkaise suomi';
  document.querySelector('.studio-back').setAttribute('href', '../');
  const script = document.createElement('script'); script.type = 'module'; script.src = editorBase + 'studio/client.js'; document.body.append(script);
  const directory = join(root, `site/${page}studio`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), '<!doctype html>\n' + document.documentElement.outerHTML);
  await writeFile(join(directory, 'template.html'), template);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Studio built (${language}): ${manifest.fields.length} shared text fields.`);
}
await writeFile(join(root, 'site/studio/studio.css'), await readFile(join(root, 'studio/studio.css')));
await writeFile(join(root, 'site/studio/config.json'), JSON.stringify({ server: process.env.STUDIO_SERVER_URL || 'http://127.0.0.1:8796' }) + '\n');
await build({ entryPoints: [join(root, 'studio/client.js')], bundle: true, format: 'esm', minify: true,
  outfile: join(root, 'site/studio/client.js'), target: ['es2022'] });
