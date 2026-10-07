import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubLogin, SESSION_DURATION } from '../auth.mjs';
import { issueStudioToken, verifyStudioToken } from '../../shared/studio-token.mjs';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioServer } from '../server.mjs';

function fixture(login = 'juhosarvanco', options = {}) {
  let now = 100000, polls = 0; const calls = [];
  const settings = { clientId: 'test-client', allowed: ['juhosarvanco','juliagrahn'], now: () => now, ...options,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const data = url.endsWith('/device/code') ? { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }
        : url.endsWith('/access_token') ? (++polls === 1 ? { error: 'authorization_pending' } : { access_token: 'private-github-token' })
        : { login, name: 'Untrusted display name' };
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } };
  const auth = new GithubLogin(settings);
  return { auth, settings, calls, advance: milliseconds => now += milliseconds };
}
test('GitHub identity flow limits polling, keeps upstream tokens private and binds sessions to allowed accounts', async () => {
  const { auth, calls, advance } = fixture();
  const attempt = await auth.begin('address');
  assert.ok(!JSON.stringify(attempt).includes('private-device'));
  assert.equal(JSON.parse(calls[0].options.body).scope, '');
  assert.deepEqual(await auth.poll(attempt.id), { pending: true, interval: 5 }); assert.equal(calls.length, 1);
  advance(5000); assert.equal((await auth.poll(attempt.id)).pending, true);
  advance(5000); const result = await auth.poll(attempt.id);
  assert.equal(result.user.login, 'juhosarvanco'); assert.equal(result.user.name, 'Juho Sarvanko');
  assert.ok(!JSON.stringify(result).includes('private-github-token'));
  const secret = 'new-repository-only-random-secret-32-chars';
  const token = issueStudioToken(result.user, secret), user = verifyStudioToken(token, secret, ['juhosarvanco']);
  assert.equal(auth.check(user).user.login, 'juhosarvanco');
  assert.throws(() => auth.check({ ...user, sid: 'another-session' }), /Kirjaudu/);
  assert.throws(() => auth.check({ ...user, sub: 'juliagrahn' }), /Kirjaudu/);
  assert.equal((await auth.refresh(user)).login, 'juhosarvanco');
  advance(SESSION_DURATION); assert.throws(() => auth.check(user), /Kirjaudu/);
});
test('remembered login survives browser inactivity and server restart, while credentials stay private on disk', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-sessions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = 'a-private-session-test-secret-at-least-32';
  const { auth, settings, advance } = fixture('juhosarvanco', { directory, secret });
  const attempt = await auth.begin('address'); advance(5000); await auth.poll(attempt.id); advance(5000);
  const result = await auth.poll(attempt.id);
  assert.equal(result.remember.length, 43);
  const bytes = await readFile(join(directory, 'github-sessions.enc'), 'utf8');
  assert.ok(!bytes.includes('private-github-token')); assert.ok(!bytes.includes(result.remember));
  assert.equal((await stat(join(directory, 'github-sessions.enc'))).mode & 0o777, 0o600);
  advance(2 * 24 * 3600000);
  const restarted = new GithubLogin(settings);
  assert.equal((await restarted.resume(result.remember)).login, 'juhosarvanco');
  await assert.rejects(restarted.resume('a'.repeat(43)), error => error.status === 401);
  assert.throws(() => restarted.check({ sub: 'juliagrahn', sid: result.user.sid }));
  restarted.logout(result.remember);
  await assert.rejects(new GithubLogin(settings).resume(result.remember), error => error.status === 401);
  assert.throws(() => new GithubLogin({ ...settings, secret: 'a-different-private-key-at-least-32-chars' }));
});

test('network failure preserves remembered login, but GitHub revocation and 30-day expiry revoke it', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-sessions-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { auth, settings, advance } = fixture('juhosarvanco', { directory, secret: 'a-private-session-test-secret-at-least-32' });
  const attempt = await auth.begin('address'); advance(5000); await auth.poll(attempt.id); advance(5000);
  const result = await auth.poll(attempt.id);
  const failing = new GithubLogin({ ...settings, fetcher: async () => { throw new TypeError('Network down'); } });
  await assert.rejects(failing.resume(result.remember), /Network down/);
  assert.equal((await new GithubLogin(settings).resume(result.remember)).login, 'juhosarvanco');
  const revoked = new GithubLogin({ ...settings, fetcher: async () => new Response('{}', { status: 401 }) });
  await assert.rejects(revoked.resume(result.remember), error => error.status === 401);
  await assert.rejects(new GithubLogin(settings).resume(result.remember), error => error.status === 401);
  const second = await auth.begin('second'); advance(5000); const later = await auth.poll(second.id);
  advance(SESSION_DURATION);
  await assert.rejects(new GithubLogin(settings).resume(later.remember), error => error.status === 401);
});

test('session endpoint renews expired access tokens after restart and logout invalidates access', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'althea-remember-endpoint-'));
  const secret = 'a-private-endpoint-test-secret-at-least-32';
  const { auth, settings, advance } = fixture('juhosarvanco', { directory, secret });
  const attempt = await auth.begin('address'); advance(5000); await auth.poll(attempt.id); advance(5000);
  const result = await auth.poll(attempt.id);
  const options = { port: 0, dataDir: directory, secret, allowed: ['juhosarvanco'], origins: ['https://editor.example'] };
  let server = await createStudioServer({ ...options, login: auth });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  await server.close(); server = await createStudioServer({ ...options, login: new GithubLogin(settings) });
  const base = `http://127.0.0.1:${server.port}`;
  const expired = issueStudioToken(result.user, secret, Date.now() - 901000);
  assert.equal((await fetch(base + '/api/studio-session', { headers: { authorization: `Bearer ${expired}` } })).status, 401);
  const headers = { authorization: `Bearer althea-remember.${result.remember}`, origin: options.origins[0] };
  const response = await fetch(base + '/api/studio-session', { headers });
  assert.equal(response.status, 200); const renewed = await response.json();
  assert.equal(verifyStudioToken(renewed.token, secret, options.allowed).sub, 'juhosarvanco');
  assert.ok(!JSON.stringify(renewed).includes('private-github-token'));
  assert.equal((await fetch(base + '/api/versions', { headers })).status, 401);
  assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers: { ...headers, origin: 'https://bad.example' } })).status, 403);
  assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(base + '/api/studio-session', { headers })).status, 401);
  assert.equal((await fetch(base + '/api/versions', { headers: { authorization: `Bearer ${renewed.token}` } })).status, 401);
});
test('GitHub login refuses other accounts, expired requests and excessive starts', async () => {
  const { auth, advance } = fixture('someone-else'); const attempt = await auth.begin('address');
  advance(5000); await auth.poll(attempt.id); advance(5000);
  await assert.rejects(auth.poll(attempt.id), error => error.status === 403);
  const later = await auth.begin('another-address'); advance(901000);
  await assert.rejects(auth.poll(later.id), error => error.status === 401);
  for(let i=0;i<5;i++)await auth.begin('limited-address');
  await assert.rejects(auth.begin('limited-address'), error => error.status === 429);
});
test('the new Studio rejects an old Studio token even if its signing key were reused accidentally', () => {
  const secret = 'a-shared-test-secret-at-least-32-characters';
  const head = Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ aud:'althea-studio',sub:'juhosarvanco',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+900 })).toString('base64url');
  const signature = createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url');
  assert.throws(() => verifyStudioToken(`${head}.${body}.${signature}`,secret,['juhosarvanco']));
});
