import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubLogin } from '../auth.mjs';
import { issueStudioToken, verifyStudioToken } from '../../shared/studio-token.mjs';
import { createHmac } from 'node:crypto';

function fixture(login = 'juhosarvanco') {
  let now = 100000, polls = 0; const calls = [];
  const auth = new GithubLogin({ clientId: 'test-client', allowed: ['juhosarvanco','juliagrahn'], now: () => now,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const data = url.endsWith('/device/code') ? { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }
        : url.endsWith('/access_token') ? (++polls === 1 ? { error: 'authorization_pending' } : { access_token: 'private-github-token' })
        : { login, name: 'Untrusted display name' };
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } });
  return { auth, calls, advance: milliseconds => now += milliseconds };
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
  advance(8 * 3600000); assert.throws(() => auth.check(user), /Kirjaudu/);
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
