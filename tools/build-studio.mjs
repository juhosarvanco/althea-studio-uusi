import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepareTemplate } from '../studio/template.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.STUDIO_BASE_PATH || '/althea-studio-uusi/';
if (!/^\/[a-zA-Z0-9_/-]*\/$/.test(base) && base !== '/') throw new Error('Invalid site base path');
const { document, manifest, template } = prepareTemplate(await readFile(join(root, 'site/index.html'), 'utf8'));
// Keep hash navigation on /studio/ while loading site assets from the root.
for (const el of document.querySelectorAll('[src], [href], [srcset]')) {
  for (const name of ['src', 'href', 'srcset']) {
    const value = el.getAttribute(name);
    if (value?.startsWith('assets/')) el.setAttribute(name, value.replace(/(^|,\s*)assets\//g, `$1${base}assets/`));
    if (name === 'href' && value === 'original.html') el.setAttribute(name, base + value);
    if (name === 'href' && value === 'studio/') el.setAttribute(name, base + value);
  }
}
for (const style of document.querySelectorAll('style')) style.textContent = style.textContent.replace(/url\((['"]?)assets\//g, `url($1${base}assets/`);
document.title = 'Althea — uuden version Studio';
// Live Studio interactions query the current layout; the public page's script
// captures DOM nodes once and is therefore unsuitable for structural updates.
document.querySelectorAll('script:not([type="application/json"])').forEach(el => el.remove());
document.querySelectorAll('head style').forEach(el => el.setAttribute('data-studio-site-style', ''));
const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex, nofollow'; document.head.append(robots);
const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'studio/studio.css'; document.head.append(css);
document.body.insertAdjacentHTML('beforeend', await readFile(join(root, 'studio/chrome.html'), 'utf8'));
const script = document.createElement('script'); script.type = 'module'; script.src = base + 'studio/client.js'; document.body.append(script);
await mkdir(join(root, 'site/studio'), { recursive: true });
await writeFile(join(root, 'site/studio/index.html'), '<!doctype html>\n' + document.documentElement.outerHTML);
await writeFile(join(root, 'site/studio/template.html'), template);
await writeFile(join(root, 'site/studio/manifest.json'), JSON.stringify(manifest));
await writeFile(join(root, 'site/studio/studio.css'), await readFile(join(root, 'studio/studio.css')));
await writeFile(join(root, 'site/studio/config.json'), JSON.stringify({ server: process.env.STUDIO_SERVER_URL || 'http://127.0.0.1:8796' }) + '\n');
await build({ entryPoints: [join(root, 'studio/client.js')], bundle: true, format: 'esm', minify: true,
  outfile: join(root, 'site/studio/client.js'), target: ['es2022'] });
console.log(`Studio built: ${manifest.fields.length} shared text fields.`);
