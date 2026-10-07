import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, open, unlink, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.studio-live'), lockPath = join(directory, 'launch.lock');
const editor = 'https://juhosarvanco.github.io/althea-studio-uusi/studio/';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ownsLock = false;

async function preflight() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Studion käynnistämiseen tarvitaan Node.js 22 tai uudempi.');
  await run('gh', ['--version'], { timeout: 15000 }).catch(() => { throw new Error('GitHubin yhteysohjelmaa ei löydy tältä Macilta.'); });
  await run(process.env.CLOUDFLARED_PATH || '/opt/homebrew/bin/cloudflared', ['--version'], { timeout: 15000 })
    .catch(() => { throw new Error('Studion etäyhteysohjelmaa ei löydy tältä Macilta.'); });
  await run('gh', ['auth', 'status', '--hostname', 'github.com'], { timeout: 20000 })
    .catch(() => { throw new Error('Macin GitHub-yhteys ei ole käytettävissä. Tarkista internetyhteys ja Macin GitHub-kirjautuminen. Studion selainkirjautuminen on erillinen.'); });
}

async function lock() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const file = await open(lockPath, 'wx', 0o600);
    ownsLock = true;
    try { await file.writeFile(JSON.stringify({ pid: process.pid })); } finally { await file.close(); }
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const saved = await readFile(lockPath, 'utf8').then(JSON.parse).catch(() => ({}));
    // A second double-click must not start a competing server/tunnel. An empty
    // file can mean the first launcher has not finished writing its PID yet.
    if (!Number.isInteger(saved.pid)) {
      const age = await stat(lockPath).then(info => Date.now() - info.mtimeMs).catch(() => 0);
      if (age < 5 * 60 * 1000) return false;
    } else {
      const command = await run('ps', ['-p', String(saved.pid), '-o', 'command=']).then(result => result.stdout).catch(() => '');
      if (command.includes('tools/studio-launch.mjs')) return false;
    }
    await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
    return lock();
  }
}

async function pageReady(address) {
  try {
    const response = await fetch(`${editor}config.json?studio-start=${Date.now()}`, {
      cache: 'no-store', signal: AbortSignal.timeout(10000)
    });
    return response.ok && (await response.json()).server === address;
  } catch { return false; }
}

async function main() {
  console.log('\nALTHEA STUDIO\n\nTarkistetaan käynnistyksen edellytykset…');
  await preflight();
  if (process.argv.includes('--check')) {
    const result = await run(process.execPath, [join(root, 'tools/studio-host.mjs'), 'status'], { cwd: root });
    const state = JSON.parse(result.stdout);
    console.log(state.running ? '\nStudio toimii ja käynnistyspainike on valmis.' : '\nKäynnistyspainike on valmis. Studio tarvitsee käynnistyksen.');
    return;
  }
  if (!await lock()) { console.log('\nStudion käynnistys on jo meneillään toisessa ikkunassa. Odota sen valmistumista.'); return; }
  console.log('\nKäynnistetään Studio uudelleen ja tarkistetaan etäyhteys…\nTallennetut tekstit, kommentit ja kirjautumiset säilyvät.');
  try {
    await run(process.execPath, [join(root, 'tools/studio-host.mjs'), 'restart'], { cwd: root, timeout: 240000, maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    throw new Error(error.stderr?.match(/Error: ([^\n]+)/)?.[1] || 'Studion käynnistys ei valmistunut. Tarkista internetyhteys ja kokeile uudelleen.');
  }
  const host = JSON.parse(await readFile(join(directory, 'host.json'), 'utf8'));
  if (!await pageReady(host.address)) {
    console.log('\nPalvelin toimii. GitHub päivittää sivun yhteysosoitetta. Tämä voi kestää muutaman minuutin…');
    const deadline = Date.now() + 5 * 60 * 1000;
    do {
      await pause(10000);
      if (await pageReady(host.address)) break;
      if (Date.now() >= deadline) throw new Error('Palvelin toimii, mutta sivun yhteysosoitteen päivitys on vielä kesken. Kokeile painiketta uudelleen hetken kuluttua.');
    } while (true);
  }
  console.log(`\nVALMIS – Studio on käytettävissä.\n\nPäivitä selaimessa avoin Studio-sivu tai avaa:\n${editor}\n\nVoit sulkea tämän ikkunan. Palvelin jää käyntiin.\nPidä Mac päällä ja internetyhteydessä yhteismuokkauksen aikana.`);
}

try { await main(); }
catch (error) { console.error(`\nKäynnistys ei valmistunut:\n${error.message}\n\nTallennetut sisällöt säilyvät. Tämä ikkuna kertoo, mikä esti käynnistyksen.`); process.exitCode = 1; }
finally { if (ownsLock) await unlink(lockPath).catch(() => {}); }
