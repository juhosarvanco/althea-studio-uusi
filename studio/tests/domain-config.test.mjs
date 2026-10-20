import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitePath, studioConfiguration } from '../config.js';
import { studioAddress } from '../../shared/studio-address.mjs';
import { spawnSync } from 'node:child_process';

test('Studio configuration and image paths follow the active hosting domain', async t => {
  const previous = { location: globalThis.location, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, previous));
  const server = 'https://studio-example.trycloudflare.com';
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push(url);
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify({ server }));
  };
  for (const [hostname, prefix] of [
    ['www.althea.fi', '/'], ['althea.fi', '/'],
    ['juhosarvanco.github.io', '/althea-studio-uusi/'], ['localhost', '/']
  ]) {
    globalThis.location = { hostname, origin: `https://${hostname}` };
    assert.equal(sitePath('assets/photo.webp'), prefix + 'assets/photo.webp');
    const configuration = await studioConfiguration({ refresh: true });
    assert.equal(requested.at(-1), prefix + 'studio/config.json');
    assert.equal(configuration.server, hostname === 'localhost' ? 'https://localhost' : server);
  }
});

test('a public editor refuses a local or insecure saving address instead of silently requiring the same computer or LAN', async t => {
  const previous = { location: globalThis.location, fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.location = { hostname: 'www.althea.fi', origin: 'https://www.althea.fi' };
  for (const server of ['http://127.0.0.1:8796', 'https://localhost', 'https://192.168.1.10',
    'https://10.0.0.5', 'https://172.20.10.3', 'https://studio.local', 'http://studio.example.com']) {
    globalThis.fetch = async () => new Response(JSON.stringify({ server }));
    await assert.rejects(studioConfiguration({ refresh: true }), /julkinen HTTPS/);
  }
  assert.equal(studioAddress('https://studio.example.com'), 'https://studio.example.com');
  assert.equal(studioAddress('http://127.0.0.1:8796', { local: true }), 'http://127.0.0.1:8796');
});

test('a release build cannot publish a localhost fallback if its remote connection setting is missing', () => {
  for (const server of ['', 'http://127.0.0.1:8796']) {
    const result = spawnSync(process.execPath, ['tools/build-studio.mjs'], {
      cwd: new URL('../../', import.meta.url), encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'true', STUDIO_SERVER_URL: server }
    });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes('Studio built'));
  }
});
