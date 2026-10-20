// Run manually on GitHub's hosted runner to test from outside the Mac's LAN.
// No account credentials, draft content or comments are sent to the runner.
import { request } from 'node:https';
import { randomBytes } from 'node:crypto';
import { studioAddress } from '../shared/studio-address.mjs';

const origin = 'https://www.althea.fi';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const get = (url, options = {}) => fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), ...options });
const response = await get(origin + '/studio/config.json');
check(response.ok, 'Studion yhteysasetukset eivät vastaa.');
const server = studioAddress((await response.json()).server);
const health = await get(server + '/health', { headers: { Origin: origin } });
check(health.ok && (await health.json()).ok === true, 'Tallennuspalvelin ei vastaa internetistä.');
check(health.headers.get('access-control-allow-origin') === origin, 'Studion selainyhteys on estetty.');
console.log('PASS: public HTTPS address, DNS, certificate and Studio health');

for (const path of ['/api/studio-session', '/api/en/layout']) {
  const preflight = await get(server + path, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization'
  } });
  check(preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === origin
    && preflight.headers.get('access-control-allow-headers')?.includes('authorization'), 'Selaimen kirjautumisyhteys on estetty.');
  const anonymous = await get(server + path, { headers: { Origin: origin } });
  check(anonymous.status === 401 && (await anonymous.json()).error, 'Kirjautumisen suojaus ei vastaa odotettua.');
}
console.log('PASS: browser login and both languages reachable; anonymous access denied');

for (const room of ['althea-uusi', 'althea-uusi-en']) {
  await new Promise((resolve, reject) => {
    const req = request(`${server}/sync/${room}`, { headers: {
      Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64')
    } }, res => {
      // An unauthenticated handshake must reach Studio and be refused by it.
      res.resume();
      if (res.statusCode === 401) resolve(); else reject(new Error(`WebSocket-yhteys palautti ${res.statusCode}.`));
    });
    req.once('upgrade', (_, socket) => { socket.destroy(); reject(new Error('Kirjautumaton WebSocket hyväksyttiin.')); });
    req.setTimeout(15000, () => req.destroy(new Error('WebSocket-yhteys ei vastaa.')));
    req.once('error', reject); req.end();
  });
}
console.log('PASS: Finnish and English WebSocket endpoints reachable from this network');
