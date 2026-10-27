// Run on the deployment artifact only: Studio's source/publication hashes stay intact.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';

const site = resolve(process.argv[2] || 'site');
const version = createHash('sha256').update(await readFile(resolve(site, 'app.js'))).digest('hex').slice(0, 12);
for (const file of ['index.html', 'en/index.html']) {
  const path = resolve(site, file), html = await readFile(path, 'utf8');
  const { document } = parseHTML(html);
  const scripts = [...document.querySelectorAll('script[src]')]
    .filter(script => /^(\.\.\/)?app\.js(\?v=[a-f0-9]+)?$/.test(script.getAttribute('src')));
  if (scripts.length !== 1) throw new Error(`Expected one public app script in ${file}`);
  const source = scripts[0].getAttribute('src');
  const original = `src="${source}"`, updated = `src="${source.split('?')[0]}?v=${version}"`;
  if (!html.includes(original)) throw new Error(`Cannot stamp public app script in ${file}`);
  await writeFile(path, html.replace(original, updated));
}
console.log(`Public app version: ${version}`);
