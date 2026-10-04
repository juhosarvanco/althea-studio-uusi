// Prepare a layout using the current shared text, then apply only its structure.
// The shared Yjs fields are never replaced by the texts in the edited HTML file.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const local = parseEnv(await readFile(resolve(root, '.env.studio'), 'utf8'));
const endpoint = `http://127.0.0.1:${local.STUDIO_PORT || '8796'}/api/local-layout`;
const call = async body => {
  const response = await fetch(endpoint, { method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${local.STUDIO_SECRET}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Ulkoasupäivitys epäonnistui.'); return result;
};
const [action, path] = process.argv.slice(2);
if (!path || !['export', 'apply'].includes(action)) throw new Error('Käytä: studio-layout.mjs export|apply tiedosto.html');
const file = resolve(path);
if (action === 'export') {
  const current = await call(); await writeFile(file, current.html);
  await writeFile(`${file}.layout.json`, JSON.stringify({ layoutHash: current.layoutHash }));
  console.log('Ajantasaiset tekstit ja pysyvät tunnisteet kopioitu ulkoasun valmistelua varten.');
} else {
  const { layoutHash } = JSON.parse(await readFile(`${file}.layout.json`, 'utf8'));
  const result = await call({ html: await readFile(file, 'utf8'), layoutHash });
  const current = await call(); await writeFile(file, current.html);
  await writeFile(`${file}.layout.json`, JSON.stringify({ layoutHash: current.layoutHash }));
  console.log(JSON.stringify({ applied: !result.unchanged, added: result.added?.length || 0,
    archived: result.archived?.length || 0, message: 'Yhteinen rakenne päivitetty. Viimeisimmät tekstit säilyivät; avoimet Studiot päivittyvät automaattisesti.' }));
}
