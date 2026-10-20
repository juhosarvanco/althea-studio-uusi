import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { studioAddress } from '../shared/studio-address.mjs';

// These probes never use an editor's credentials or a valid content version.
// Even a broken authentication check cannot publish or replace real content.
export async function checkStudioSecurity({ website = 'https://www.althea.fi', request = fetch } = {}) {
  const configuration = await (await request(website + '/studio/config.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) })).json();
  const servers = [...new Set([configuration.server, configuration.relay].filter(Boolean).map(value => studioAddress(value)))];
  const origin = new URL(website).origin, checks = [], jobs = [];
  const reads = ['layout', 'versions', 'field-history?fieldId=alku-h1-1', 'media', 'media-file/' + '0'.repeat(64)];
  const writes = ['studio-publish', 'published', 'export', 'checkpoint', 'restore', 'field-restore', 'media-upload', 'media-assign', 'media-delete', 'media-restore', 'poll-open', 'poll-read', 'poll-send', 'poll-close'];
  const forged = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.'
    + Buffer.from(JSON.stringify({ sub: 'juhosarvanco', aud: 'althea-studio-uusi', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url') + '.unsigned';
  function probe(server, path, { method = 'GET', expected = [401], from = origin, authorization, privateResponse = true } = {}) {
    jobs.push(async () => {
      let status;
      try {
        const response = await request(server + path, { method, cache: 'no-store', redirect: 'manual',
          headers: { Origin: from, ...(authorization ? { authorization } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
          ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
        status = response.status;
        await response.arrayBuffer();
        const noCache = !privateResponse || (response.headers.get('cache-control') || '').includes('no-store');
        const noCredentials = response.headers.get('access-control-allow-credentials') !== 'true';
        checks.push({ server, path, method, status, passed: expected.includes(status) && noCache && noCredentials });
      } catch { checks.push({ server, path, method, status: status || null, passed: false, error: 'Connection failed or timed out' }); }
    });
  }
  for (const server of servers) {
    for (const prefix of ['/api/', '/api/en/']) {
      for (const path of reads) probe(server, prefix + path);
      for (const path of writes) probe(server, prefix + path, { method: 'POST' });
      probe(server, prefix + 'layout', { authorization: `Bearer ${forged}` });
      probe(server, prefix + 'layout', { from: 'https://attacker.example', expected: [403] });
      probe(server, prefix + 'local-layout', { expected: [403, 404], privateResponse: false });
      probe(server, prefix + 'poll-open', { method: 'OPTIONS', expected: [204] });
    }
    probe(server, '/api/studio-session?name=julia');
    probe(server, '/api/studio-session', { authorization: 'Bearer althea-remember.' + 'a'.repeat(43) });
    probe(server, '/api/login-poll', { method: 'POST' });
    probe(server, '/api/logout', { method: 'POST', authorization: 'Bearer althea-remember.' + 'a'.repeat(43) });
    for (const path of ['/.env.studio', '/.git/config', '/.studio-live/data/updates.bin', '/.studio-live/data/github-sessions.enc'])
      probe(server, path, { expected: [403, 404], privateResponse: false });
  }
  for (const path of ['/.env.studio', '/.git/config', '/.studio-live/data/github-sessions.enc'])
    probe(website, path, { expected: [403, 404], privateResponse: false });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
  return { checkedAt: new Date().toISOString(), website, total: checks.length,
    passed: checks.filter(check => check.passed).length, failures: checks.filter(check => !check.passed), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkStudioSecurity();
  console.log(`Studio security checks: ${result.passed}/${result.total} passed.`);
  if (result.failures.length) { console.error(JSON.stringify(result.failures, null, 2)); process.exitCode = 1; }
}
