import { readFile, writeFile, mkdir, chmod, cp } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), directory = join(root, '.studio-live');
const statePath = join(directory, 'host.json'), envPath = join(root, '.env.studio');
const repository = 'juhosarvanco/althea-studio-uusi', editor = 'https://juhosarvanco.github.io/althea-studio-uusi/studio/';
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const state = async () => { try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return {}; } };
await mkdir(directory, { recursive: true, mode: 0o700 });
const saveState = host => writeFile(statePath, JSON.stringify(host), { mode: 0o600 });
async function owned(pid, kind) {
  if (!alive(pid)) return false;
  const command = (await run('ps', ['-p', String(pid), '-o', 'command=']).catch(() => ({ stdout: '' }))).stdout;
  return kind === 'server' ? command.includes(join(root, 'studio/server.mjs')) : kind === 'tunnel' ? command.includes('cloudflared') && command.includes('127.0.0.1:8796') : command.includes('caffeinate');
}
async function stop(host, kinds = ['server', 'tunnel', 'awake']) {
  for (const kind of kinds) if (await owned(host[kind], kind)) process.kill(host[kind], 'SIGTERM');
  for (let i = 0; i < 80 && await owned(host.server, 'server'); i++) await pause();
}
async function settings() {
  try { return parseEnv(await readFile(envPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { STUDIO_SECRET: randomBytes(32).toString('hex'), STUDIO_HOST: '127.0.0.1', STUDIO_PORT: '8796',
    STUDIO_ORIGINS: 'https://juhosarvanco.github.io,http://127.0.0.1:8796,http://localhost:8796',
    ALLOWED_LOGINS: 'juhosarvanco,juliagrahn', GITHUB_CLIENT_ID: 'Ov23liJL2aMaIb0sJPfn' };
  await writeFile(envPath, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 }); return env;
}
function launch(command, args, file, local) {
  const fd = openSync(join(directory, file), 'w', 0o600);
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...local, STUDIO_DEV: '0', STUDIO_DATA_DIR: join(directory, 'data') }, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); child.on('error', () => {}); child.unref(); return child;
}
async function startServer(local) {
  const child = launch(process.execPath, [join(root, 'studio/server.mjs')], 'server.log', local);
  for (let i = 0; i < 80; i++) {
    if (!alive(child.pid)) throw new Error('Uusi palvelin ei käynnistynyt. Tarkista tämän repon .studio-live/server.log.');
    try { if ((await fetch('http://127.0.0.1:8796/health')).ok) return child.pid; } catch {}
    await pause();
  }
  throw new Error('Uusi palvelin ei vastaa.');
}
async function build(address) { await run(process.execPath, [join(root, 'tools/build-studio.mjs')], { cwd: root, env: { ...process.env, STUDIO_SERVER_URL: address }, maxBuffer: 2 * 1024 * 1024 }); }
const command = process.argv[2] || 'status';
const previous = await state();
if (command === 'status') {
  console.log(JSON.stringify({ running: await owned(previous.server, 'server') && await owned(previous.tunnel, 'tunnel'), editor, server: previous.address || null }));
} else if (command === 'stop') {
  await stop(previous); await saveState({ address: previous.address, editor }); console.log('Uuden Studion palvelin pysäytetty. Tallennetut sisällöt säilyvät.');
} else if (command === 'start' || command === 'restart') {
  const local = await settings(); await chmod(envPath, 0o600);
  if (command === 'start' && await owned(previous.server, 'server') && await owned(previous.tunnel, 'tunnel')) { console.log(`Uusi Studio on jo käynnissä: ${editor}`); process.exit(0); }
  if (command === 'restart' && !await owned(previous.tunnel, 'tunnel')) throw new Error('Etäyhteys puuttuu. Käytä start-komentoa.');
  await stop(previous, command === 'restart' ? ['server', 'awake'] : undefined);
  try {
    await mkdir(join(directory, 'backups'), { recursive: true, mode: 0o700 });
    await cp(join(directory, 'data'), join(directory, 'backups', new Date().toISOString().replace(/[:.]/g, '-')), { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await build(previous.address || 'http://127.0.0.1:8796');
  const host = { editor, server: await startServer(local), address: previous.address }; await saveState(host);
  if (command === 'restart') host.tunnel = previous.tunnel;
  else {
    host.tunnel = launch(process.env.CLOUDFLARED_PATH || '/opt/homebrew/bin/cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8796'], 'tunnel.log', local).pid; await saveState(host);
    for (let i = 0; i < 160; i++) {
      const log = await readFile(join(directory, 'tunnel.log'), 'utf8'), address = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (address) { host.address = address; break; }
      if (!alive(host.tunnel)) throw new Error('Uuden Studion etäyhteys ei käynnistynyt.'); await pause();
    }
    if (!host.address) throw new Error('Etäyhteyden osoitetta ei saatu.');
  }
  if (process.platform === 'darwin') host.awake = launch('/usr/bin/caffeinate', ['-i', '-w', String(host.server)], 'awake.log', local).pid;
  await saveState(host); await build(host.address);
  await run('gh', ['variable', 'set', 'STUDIO_SERVER_URL', '--repo', repository, '--body', host.address]);
  if (!process.argv.includes('--no-deploy')) await run('gh', ['workflow', 'run', 'pages.yml', '--repo', repository]);
  console.log(`Uusi Studio toimii omalla palvelimellaan: ${editor}`);
} else throw new Error('Käytä start, restart, stop tai status.');
