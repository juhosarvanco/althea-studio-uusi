// Stable HTTPS-only route for networks that cannot reach the temporary tunnel.
// This deploys only a small proxy in its own site; it never deploys page content.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioAddress } from '../shared/studio-address.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const recordPath = join(root, '.studio-live/relay.json');
const name = 'althea-studio-connect', account = 'juhosarvanco';
const sha = text => createHash('sha1').update(text).digest('hex');

export function relayFiles(target) {
  const upstream = studioAddress(target);
  return {
    '/_redirects': `/api/local-layout /404.html 404!\n/api/en/local-layout /404.html 404!\n/health ${upstream}/health 200!\n/api/* ${upstream}/api/:splat 200!\n`,
    '/_headers': '/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n',
    '/robots.txt': 'User-agent: *\nDisallow: /\n',
    '/404.html': '<!doctype html><title>Althea</title><p>Not found.</p>',
    '/index.html': '<!doctype html><html lang="fi"><meta name="robots" content="noindex,nofollow"><title>Althea Studio — yhteys</title><p>Althea Studion yhteyspalvelu.</p><p><a href="https://www.althea.fi/studio/">Avaa Studio</a></p></html>'
  };
}

export async function ensureRelay(target, { create = false } = {}) {
  const upstream = studioAddress(target);
  let saved;
  try { saved = JSON.parse(await readFile(recordPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; if (!create) return null; }
  const settings = JSON.parse(await readFile(join(homedir(), 'Library/Preferences/netlify/config.json'), 'utf8'));
  const token = settings.users?.[settings.userId]?.auth?.token;
  if (!token) throw new Error('Studion varayhteyden Netlify-kirjautuminen puuttuu.');
  async function api(path, body, method = body ? 'POST' : 'GET', binary = false) {
    const response = await fetch('https://api.netlify.com/api/v1' + path, {
      method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
      ...(body ? { body: binary ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Studion varayhteyden päivitys epäonnistui (Netlify ${response.status}).`);
    return response.json();
  }
  if (!saved) {
    // Resolve an already-created site first so retries never create duplicates.
    const sites = await api('/sites');
    const existing = sites.find(site => site.name === name && site.account_slug === account);
    const site = existing || await api(`/${account}/sites`, { name, force_ssl: true });
    saved = { id: site.id, name: site.name, url: site.ssl_url || `https://${name}.netlify.app`, upstream: null };
    await mkdir(join(root, '.studio-live'), { recursive: true, mode: 0o700 });
    await writeFile(recordPath, JSON.stringify(saved), { mode: 0o600 });
  }
  // Pin this dedicated site. Never mutate either of the previous Althea sites.
  const site = await api(`/sites/${saved.id}`);
  if (site.name !== name || saved.name !== name || site.account_slug !== account
    || studioAddress(saved.url) !== `https://${name}.netlify.app`) throw new Error('Studion varayhteyden sivustotunniste ei täsmää.');
  const files = relayFiles(upstream), digest = sha(JSON.stringify(files));
  if (saved.digest !== digest) {
    let deploy = await api(`/sites/${saved.id}/deploys`, { files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, sha(text)])), draft: false });
    for (const [path, text] of Object.entries(files)) if (deploy.required?.includes(sha(text)))
      await api(`/deploys/${deploy.id}/files${path}`, text, 'PUT', true);
    const deadline = Date.now() + 90000;
    while (deploy.state !== 'ready') {
      if (deploy.state === 'error' || Date.now() > deadline) throw new Error('Studion varayhteyden julkaisu ei valmistunut.');
      await new Promise(resolve => setTimeout(resolve, 1000));
      deploy = await api(`/deploys/${deploy.id}`);
    }
    saved = { ...saved, upstream, digest, deploy: deploy.id };
    await writeFile(recordPath, JSON.stringify(saved), { mode: 0o600 });
  }
  const response = await fetch(saved.url + '/health', { headers: { Origin: 'https://www.althea.fi' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok || (await response.json()).ok !== true || response.headers.get('access-control-allow-origin') !== 'https://www.althea.fi')
    throw new Error('Studion varayhteys ei vastaa oikein.');
  return saved;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = JSON.parse(await readFile(join(root, '.studio-live/host.json'), 'utf8'));
  const relay = await ensureRelay(host.address, { create: process.argv.includes('--create') });
  console.log(relay ? `Studion varayhteys toimii: ${relay.url}` : 'Varayhteyttä ei ole otettu käyttöön.');
}
