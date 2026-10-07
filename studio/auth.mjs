import { randomBytes, createHash } from 'node:crypto';
import { SessionFile } from './sessions.mjs';

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const profileNames = { juhosarvanco: 'Juho Sarvanko', juliagrahn: 'Julia Grahn' };
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');

export class GithubLogin {
  constructor({ clientId, allowed, fetcher = fetch, now = Date.now, directory, secret }) {
    this.clientId = clientId; this.allowed = allowed; this.fetcher = fetcher; this.now = now;
    this.attempts = new Map(); this.sessions = new Map(); this.rate = new Map();
    this.file = directory ? new SessionFile(directory, secret) : null;
    for (const [id, session] of this.file?.read() || []) {
      if (typeof id === 'string' && session?.user?.sid === id && allowed.includes(session.user.login)
        && typeof session.token === 'string' && /^[a-f0-9]{64}$/.test(session.rememberHash)
        && Number.isFinite(session.expires) && session.expires > now()) this.sessions.set(id, session);
    }
  }
  save() { this.file?.write([...this.sessions]); }
  async github(url, body, token) {
    const response = await this.fetcher(url, { method: body ? 'POST' : 'GET',
      headers: { accept: 'application/json', 'user-agent': 'Althea-Studio-Uusi',
        ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (response.status === 401) fail('GitHub-kirjautuminen ei ole enää voimassa.', 401);
    if (!response.ok) fail('GitHub-kirjautumiseen ei saatu yhteyttä. Yritä hetken kuluttua uudelleen.', 502);
    return data;
  }
  clean() {
    const now = this.now();
    for (const [id, value] of this.attempts) if (value.expires <= now) this.attempts.delete(id);
    let changed = false;
    for (const [id, value] of this.sessions) if (value.expires <= now) { this.sessions.delete(id); changed = true; }
    if (changed) this.save();
    for (const [id, value] of this.rate) if (value.until <= now) this.rate.delete(id);
  }
  async begin(ip) {
    if (!this.clientId) fail('GitHub-kirjautumissovelluksen käyttöönotto on vielä kesken.', 503);
    this.clean();
    const current = this.rate.get(ip) || { count: 0, until: this.now() + 60000 };
    if (++current.count > 5 || this.attempts.size >= 100 || this.rate.size >= 1000) fail('Odota hetki ennen uutta kirjautumisyritystä.', 429);
    this.rate.set(ip, current);
    // Empty scope identifies the GitHub account without requesting repository access.
    const data = await this.github('https://github.com/login/device/code', { client_id: this.clientId, scope: '' });
    if (data.error || !data.device_code || !data.user_code || data.verification_uri !== 'https://github.com/login/device')
      fail(data.error === 'device_flow_disabled' ? 'GitHub-sovelluksen Device Flow pitää ottaa käyttöön.' : 'GitHub-kirjautumista ei voitu aloittaa.', 503);
    const id = randomBytes(32).toString('base64url'), interval = Math.max(5, data.interval || 5);
    const expires = this.now() + Math.min(900, data.expires_in || 900) * 1000;
    this.attempts.set(id, { device: data.device_code, interval, next: this.now() + interval * 1000, expires, busy: false });
    return { id, code: data.user_code, verification: data.verification_uri, interval, expiresIn: Math.floor((expires - this.now()) / 1000) };
  }
  async poll(id) {
    this.clean();
    const attempt = this.attempts.get(id);
    if (!attempt) fail('Kirjautumispyyntö vanheni. Aloita kirjautuminen uudelleen.', 401);
    if (attempt.busy || this.now() < attempt.next) return { pending: true, interval: attempt.interval };
    attempt.busy = true; attempt.next = this.now() + attempt.interval * 1000;
    try {
      const result = await this.github('https://github.com/login/oauth/access_token', {
        client_id: this.clientId, device_code: attempt.device, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (result.error === 'authorization_pending') return { pending: true, interval: attempt.interval };
      if (result.error === 'slow_down') { attempt.interval = Math.max(attempt.interval + 5, result.interval || 0); attempt.next = this.now() + attempt.interval * 1000; return { pending: true, interval: attempt.interval }; }
      if (result.error || !result.access_token) {
        this.attempts.delete(id);
        fail(result.error === 'access_denied' ? 'GitHub-kirjautuminen peruttiin.' : 'Kirjautuminen vanheni. Aloita uudelleen.', 401);
      }
      const profile = await this.github('https://api.github.com/user', null, result.access_token);
      this.attempts.delete(id);
      if (!this.allowed.includes(profile.login)) fail('Tällä GitHub-tunnuksella ei ole muokkausoikeutta tähän Studioon.', 403);
      this.clean();
      if (this.sessions.size >= 100) fail('Liian monta kirjautumista. Kirjaudu ensin ulos toisesta selaimesta.', 429);
      const sid = randomBytes(32).toString('base64url'), remember = randomBytes(32).toString('base64url');
      const user = { login: profile.login, name: profileNames[profile.login] || profile.login, sid };
      this.sessions.set(sid, { token: result.access_token, user, rememberHash: digest(remember), expires: this.now() + SESSION_DURATION });
      this.save();
      return { user, remember };
    } finally { attempt.busy = false; }
  }
  check(user) {
    this.clean();
    const session = this.sessions.get(user.sid);
    if (!session || session.user.login !== user.sub || !this.allowed.includes(user.sub)) fail('Kirjaudu uudelleen GitHubilla. Tallennettu työversio säilyy.', 401);
    return session;
  }
  remembered(remember) {
    this.clean();
    if (typeof remember !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(remember)) fail('Kirjaudu omalla GitHub-tunnuksellasi.', 401);
    const hash = digest(remember);
    const entry = [...this.sessions.values()].find(session => session.rememberHash === hash);
    if (!entry) fail('Kirjaudu uudelleen GitHubilla. Tallennettu työversio säilyy.', 401);
    return this.check({ sid: entry.user.sid, sub: entry.user.login });
  }
  async resume(remember) {
    const session = this.remembered(remember);
    return this.refresh({ sid: session.user.sid, sub: session.user.login });
  }
  logout(remember) {
    const session = this.remembered(remember);
    this.sessions.delete(session.user.sid); this.save();
    return session.user;
  }
  async refresh(user) {
    const session = this.check(user);
    let profile;
    try { profile = await this.github('https://api.github.com/user', null, session.token); }
    catch (error) { if (error.status === 401) { this.sessions.delete(user.sid); this.save(); } throw error; }
    if (profile.login !== user.sub || !this.allowed.includes(profile.login)) { this.sessions.delete(user.sid); this.save(); fail('GitHub-kirjautuminen ei ole enää voimassa.', 401); }
    return session.user;
  }
}
