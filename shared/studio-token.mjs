import { createHmac, timingSafeEqual } from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function issueStudioToken(user, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('STUDIO_SECRET must contain at least 32 characters');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ aud: 'althea-studio-uusi', sub: user.login, name: user.name || user.login, ...(user.sid ? { sid: user.sid } : {}),
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 900 });
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

export function verifyStudioToken(token, secret, allowed, now = Date.now()) {
  try {
    if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 4096) throw 0;
    const [head, body, signature, extra] = token.split('.');
    if (extra || !signature) throw 0;
    const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw 0;
    const header = JSON.parse(Buffer.from(head, 'base64url'));
    const user = JSON.parse(Buffer.from(body, 'base64url'));
    if (header.alg !== 'HS256' || user.aud !== 'althea-studio-uusi' || !allowed.includes(user.sub)
      || !Number.isFinite(user.exp) || !Number.isFinite(user.iat)
      || user.exp <= now / 1000 || user.iat > now / 1000 + 30
      || user.exp - user.iat > 900) throw 0;
    return user;
  } catch {
    const error = new Error('Kirjaudu uudelleen yhteiseditoriin.');
    error.status = 401;
    throw error;
  }
}
