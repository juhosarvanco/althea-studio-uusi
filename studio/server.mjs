import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import * as awareness from 'y-protocols/awareness';
import { StudioStore, vector } from './store.mjs';
import { issueStudioToken, verifyStudioToken } from '../shared/studio-token.mjs';
import { MediaLibrary, MAX_IMAGE_BYTES, imageSlots, changeImage } from './media.mjs';
import { GithubLogin } from './auth.mjs';
import { GithubPublisher } from './publish.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const packet = (type, payload) => { const e = encoding.createEncoder(); encoding.writeVarUint(e, type); encoding.writeVarUint8Array(e, payload); return encoding.toUint8Array(e); };

export async function createStudioServer(options = {}) {
  const host = options.host || process.env.STUDIO_HOST || '127.0.0.1';
  const development = options.development ?? process.env.STUDIO_DEV === '1';
  if (development && host !== '127.0.0.1') throw new Error('Development identities require a loopback-only host.');
  const secret = options.secret || process.env.STUDIO_SECRET || (development ? randomBytes(32).toString('hex') : '');
  const allowed = options.allowed || (process.env.ALLOWED_LOGINS || '').split(',').filter(Boolean);
  const origins = options.origins || (process.env.STUDIO_ORIGINS || '').split(',').filter(Boolean);
  if (!development && (secret.length < 32 || !allowed.length || !origins.length))
    throw new Error('Set STUDIO_SECRET, ALLOWED_LOGINS and STUDIO_ORIGINS before serving remote users.');
  const manifest = JSON.parse(await readFile(join(root, 'site/studio/manifest.json')));
  const store = new StudioStore(options.dataDir || process.env.STUDIO_DATA_DIR || join(root, '.studio-data'),
    manifest, await readFile(join(root, 'site/studio/template.html'), 'utf8'));
  const media = new MediaLibrary(store.directory, join(root, 'site'), store.template);
  const login = options.login || new GithubLogin({ clientId: process.env.GITHUB_CLIENT_ID || '', allowed });
  const publisher = options.publisher || new GithubPublisher({ store, media, site: join(root, 'site') });
  const online = new awareness.Awareness(store.doc); online.setLocalState(null);
  const connections = new Map();
  const layoutSubscribers = new Set();
  const mediaSubscribers = new Set();
  const acceptedOrigins = new Set(origins);
  const authenticate = req => {
    const user = verifyStudioToken((req.headers.authorization || '').replace(/^Bearer /, ''), secret, development ? ['juho', 'julia'] : allowed);
    if (!development) login.check(user);
    return user;
  };
  const readBody = async (req, limit = 8192) => {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) { const error = new Error('Request too large'); error.status = 413; throw error; } chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  };
  const broadcast = bytes => { for (const socket of connections.keys()) if (socket.readyState === 1) socket.send(bytes); };
  const ack = () => packet(4, new TextEncoder().encode(vector(store.doc)));
  store.doc.on('update', update => {
    const e = encoding.createEncoder(); encoding.writeVarUint(e, 0); sync.writeUpdate(e, update);
    broadcast(encoding.toUint8Array(e)); broadcast(ack());
  });
  const layoutNotice = () => packet(5, new TextEncoder().encode(JSON.stringify({ layoutHash: store.manifest.layoutHash })));
  store.on('layout', () => { const notice = layoutNotice(); for (const socket of layoutSubscribers) if (socket.readyState === 1) socket.send(notice); });
  online.on('update', ({ added, updated, removed }) => broadcast(packet(1, awareness.encodeAwarenessUpdate(online, [...added, ...updated, ...removed]))));
  function response(req, res, status, body, headers = {}) {
    const origin = req.headers.origin;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', ...(acceptedOrigins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}), ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }
  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.headers.origin && !acceptedOrigins.has(req.headers.origin)) return response(req, res, 403, { error: 'Origin not allowed' });
      if (req.method === 'OPTIONS') return response(req, res, 204, '', { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' });
      if (url.pathname === '/health') return response(req, res, 200, { ok: true });
      if (!development && req.method === 'POST' && url.pathname === '/api/login-start') {
        if (!acceptedOrigins.has(req.headers.origin)) return response(req, res, 403, { error: 'Origin not allowed' });
        await readBody(req);
        return response(req, res, 200, await login.begin(req.headers['cf-connecting-ip'] || req.socket.remoteAddress));
      }
      if (!development && req.method === 'POST' && url.pathname === '/api/login-poll') {
        if (!acceptedOrigins.has(req.headers.origin)) return response(req, res, 403, { error: 'Origin not allowed' });
        const body = await readBody(req), result = await login.poll(body.id);
        return response(req, res, 200, result.pending ? result : { user: { login: result.user.login, name: result.user.name }, token: issueStudioToken(result.user, secret) });
      }
      if (!development && req.method === 'GET' && url.pathname === '/api/studio-session') {
        const user = await login.refresh(authenticate(req));
        return response(req, res, 200, { user: { login: user.login, name: user.name }, token: issueStudioToken(user, secret) });
      }
      if (url.pathname === '/api/studio-session' && development) {
        // Never accessible via a tunnel, even when the process is bound to loopback.
        const requestedHost = (req.headers.host || '').split(':')[0];
        if (!['127.0.0.1', 'localhost'].includes(requestedHost) || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'])
          return response(req, res, 403, { error: 'Local testing only' });
        const login = url.searchParams.get('name') === 'julia' ? 'julia' : 'juho';
        const user = { login, name: login === 'julia' ? 'Julia (kokeilu)' : 'Juho (kokeilu)' };
        return response(req, res, 200, { user, token: issueStudioToken(user, secret), server: `http://${req.headers.host}`, development: true });
      }
      if (url.pathname.startsWith('/api/')) {
        const localLayout = url.pathname === '/api/local-layout';
        let user;
        if (localLayout) {
          const requestedHost = (req.headers.host || '').split(':')[0];
          const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
          const expected = Buffer.from(secret);
          if (!['127.0.0.1', 'localhost'].includes(requestedHost) || req.headers.origin
            || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']
            || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
            return response(req, res, 403, { error: 'Local operator only' });
          user = { sub: 'althea-layout', name: 'Ulkoasupäivitys' };
        } else user = authenticate(req);
        if (req.method === 'POST' && url.pathname === '/api/studio-publish') {
          if (development) return response(req, res, 403, { error: 'Local testing cannot publish.' });
          if (!acceptedOrigins.has(req.headers.origin)) return response(req, res, 403, { error: 'Origin not allowed' });
          return response(req, res, 200, await publisher.publish(await readBody(req), user));
        }
        if (req.method === 'GET' && url.pathname === '/api/media') return response(req, res, 200, { images: media.list(), slots: imageSlots(store.layout) });
        if (req.method === 'GET' && url.pathname.startsWith('/api/media-file/'))
          return response(req, res, 200, media.read(url.pathname.slice('/api/media-file/'.length)), { 'content-type': 'image/webp', 'content-security-policy': "default-src 'none'" });
        if (req.method === 'POST' && url.pathname === '/api/media-upload') {
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > MAX_IMAGE_BYTES) { const error = new Error('Kuva on liian suuri (enintään 2 Mt).'); error.status = 413; throw error; } chunks.push(chunk); }
          const result = media.upload(Buffer.concat(chunks), url.searchParams.get('name'), user);
          for (const socket of mediaSubscribers) if (socket.readyState === 1) socket.send(packet(6, new Uint8Array()));
          return response(req, res, 200, result);
        }
        let body = {};
        if (req.method === 'POST') {
          const chunks = []; let bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; if (bytes > (localLayout ? 4 * 1024 * 1024 : 8192)) { const e = new Error('Request too large'); e.status = 413; throw e; } chunks.push(chunk); }
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        }
        if (localLayout && req.method === 'GET') return response(req, res, 200, store.export());
        if (localLayout && req.method === 'POST') return response(req, res, 200, store.applyLayout(body.html, body.layoutHash, user));
        if (req.method === 'POST' && url.pathname === '/api/media-assign') return response(req, res, 200, changeImage(store, media, body, user));
        if (req.method === 'GET' && url.pathname === '/api/layout') return response(req, res, 200, store.layoutView());
        if (req.method === 'GET' && url.pathname === '/api/versions') return response(req, res, 200, { versions: store.versions() });
        if (req.method === 'GET' && url.pathname === '/api/field-history')
          return response(req, res, 200, store.fieldHistory(url.searchParams.get('fieldId')));
        if (req.method === 'POST' && url.pathname === '/api/field-restore')
          return response(req, res, 200, store.restoreField(body.fieldId, body.id, body.expectedHash, body.versionHash, user));
        if (req.method === 'POST' && url.pathname === '/api/published') {
          store.published(body.previousHash, body.publicHash);
          store.checkpoint('Julkaistu sivustolle', user.name); return response(req, res, 200, { ok: true });
        }
        if (req.method === 'POST' && ['/api/export', '/api/checkpoint', '/api/restore'].includes(url.pathname)) {
          if (body.vector !== vector(store.doc)) return response(req, res, 409, { error: 'Sisältö muuttui. Odota tallennusta ja yritä uudelleen.' });
          if (url.pathname === '/api/export') {
            const snapshot = store.export(), publication = { ...snapshot, assets: media.publicationAssets(snapshot.html) };
            // Leave room below the hosted publishing function's response limit,
            // including base64 expansion and the exported page itself.
            if (Buffer.byteLength(JSON.stringify(publication)) > 5.5 * 1024 * 1024)
              return response(req, res, 413, { error: 'Julkaisun kuvat ovat yhteensä liian suuria. Käytä pienempiä kuvia ja yritä uudelleen.' });
            return response(req, res, 200, publication);
          }
          if (url.pathname === '/api/checkpoint') return response(req, res, 200, store.checkpoint(body.title, user.name));
          return response(req, res, 200, store.restore(body.id, body.vector, user));
        }
        return response(req, res, 404, { error: 'Unknown route' });
      }
      if (!development && !['127.0.0.1', 'localhost'].includes((req.headers.host || '').split(':')[0]))
        return response(req, res, 404, { error: 'Avaa Studio GitHub Pagesin osoitteessa.' });
      let path = decodeURIComponent(url.pathname);
      if (path.startsWith('/althea-studio-uusi/')) path = path.slice('/althea-studio-uusi'.length);
      if (path.endsWith('/')) path += 'index.html';
      const site = join(root, 'site'); const file = resolve(site, `.${path}`);
      if (!file.startsWith(site + '/') || !TYPES[extname(file)]) return response(req, res, 403, { error: 'Forbidden' });
      const data = await readFile(file);
      return response(req, res, 200, data, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    } catch (error) { response(req, res, error.status || (error.code === 'ENOENT' ? 404 : 400), { error: error.message }); }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024,
    handleProtocols: protocols => [...protocols].find(value => value.startsWith('althea-auth.')) || false });
  http.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/sync/althea-uusi' || !acceptedOrigins.has(req.headers.origin)) throw new Error('Origin not allowed');
      const protocol = (req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim()).find(value => value.startsWith('althea-auth.'));
      const user = verifyStudioToken(protocol?.slice(12), secret, development ? ['juho', 'julia'] : allowed);
      if (!development) login.check(user);
      sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws, user));
    } catch { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); }
  });
  sockets.on('connection', (socket, user) => {
    const ids = new Set(); connections.set(socket, ids);
    const expire = setTimeout(() => socket.close(4001, 'Session expired'), Math.max(0, user.exp * 1000 - Date.now()));
    socket.on('close', () => { clearTimeout(expire); connections.delete(socket); layoutSubscribers.delete(socket); mediaSubscribers.delete(socket); awareness.removeAwarenessStates(online, [...ids], socket); });
    socket.on('error', () => socket.close());
    socket.on('message', bytes => {
      try {
        const d = decoding.createDecoder(new Uint8Array(bytes)); const type = decoding.readVarUint(d);
        if (type === 0) {
          const subtype = decoding.readVarUint(d);
          if (subtype === 0) {
            const e = encoding.createEncoder(); encoding.writeVarUint(e, 0);
            sync.writeSyncStep2(e, store.doc, decoding.readVarUint8Array(d)); socket.send(encoding.toUint8Array(e)); socket.send(ack());
          } else if (subtype === 1 || subtype === 2) { store.apply(decoding.readVarUint8Array(d), socket, user); socket.send(ack()); }
          else throw new Error('Unknown sync message');
        } else if (type === 1) {
          const incoming = decoding.createDecoder(decoding.readVarUint8Array(d)); const count = decoding.readVarUint(incoming);
          if (count > 20) throw new Error('Invalid presence');
          const accepted = [];
          for (let i = 0; i < count; i++) {
            const id = decoding.readVarUint(incoming), clock = decoding.readVarUint(incoming);
            let state = JSON.parse(decoding.readVarString(incoming));
            // y-websocket relays known remote presence on reconnect. Its owner
            // remains authoritative; a relay cannot rename or remove that user.
            if ([...connections].some(([other, otherIds]) => other !== socket && otherIds.has(id))) continue;
            if (state) {
              state = { user: { name: user.name, color: user.sub.includes('julia') ? '#a35d6a' : '#48645a' },
                activeField: typeof state.activeField === 'string' ? state.activeField.slice(0, 100) : null,
                cursor: state.cursor || null };
              ids.add(id);
            }
            accepted.push({ id, clock, state });
          }
          const e = encoding.createEncoder(); encoding.writeVarUint(e, accepted.length);
          for (const { id, clock, state } of accepted) {
            encoding.writeVarUint(e, id); encoding.writeVarUint(e, clock); encoding.writeVarString(e, JSON.stringify(state));
          }
          awareness.applyAwarenessUpdate(online, encoding.toUint8Array(e), socket);
        } else if (type === 3) socket.send(packet(1, awareness.encodeAwarenessUpdate(online, [...online.getStates().keys()])));
        else if (type === 5) { layoutSubscribers.add(socket); socket.send(layoutNotice()); }
        else if (type === 6) mediaSubscribers.add(socket);
        else throw new Error('Unknown message');
      } catch (error) { console.warn('Studio rejected an update:', error.message); socket.close(1008, 'Invalid update'); }
    });
    const e = encoding.createEncoder(); encoding.writeVarUint(e, 0); sync.writeSyncStep1(e, store.doc); socket.send(encoding.toUint8Array(e));
    socket.send(packet(1, awareness.encodeAwarenessUpdate(online, [...online.getStates().keys()])));
  });
  const timer = setInterval(() => { if (connections.size) store.checkpoint('Automaattinen versio', 'Althea'); }, 15 * 60 * 1000); timer.unref();
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(options.port ?? Number(process.env.STUDIO_PORT || 8796), host, resolve); });
  const port = http.address().port;
  if (development) { acceptedOrigins.add(`http://127.0.0.1:${port}`); acceptedOrigins.add(`http://localhost:${port}`); }
  return { http, store, media, port, secret, close: async () => {
    clearInterval(timer); for (const socket of connections.keys()) socket.terminate();
    await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => http.close(resolve)); online.destroy(); store.close();
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createStudioServer();
  console.log(`Althea studio server: http://127.0.0.1:${server.port}${process.env.STUDIO_DEV === '1' ? '/studio/' : '/health'}`);
  const stop = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
