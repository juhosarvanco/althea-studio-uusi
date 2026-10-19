import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitePath, studioConfiguration } from '../config.js';

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
