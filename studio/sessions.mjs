import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

// Private server-side storage. GitHub credentials never enter the public site,
// document exports or browser storage. The key is the existing local secret.
export class SessionFile {
  constructor(directory, secret) {
    if (!secret || secret.length < 32) throw new Error('A private Studio secret is required for saved sessions.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'github-sessions.enc');
    this.key = createHash('sha256').update('althea-studio-uusi/sessions\0' + secret).digest();
  }
  read() {
    let bytes;
    try { bytes = readFileSync(this.path); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const saved = JSON.parse(bytes);
    if (saved.version !== 1) throw new Error('Unsupported saved session format.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(saved.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
    const records = JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data, 'base64')), decipher.final()]).toString());
    if (!Array.isArray(records) || records.length > 100) throw new Error('Invalid saved sessions.');
    return records;
  }
  write(records) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(records)), cipher.final()]);
    const bytes = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    const temporary = this.path + '.tmp', fd = openSync(temporary, 'w', 0o600);
    try { chmodSync(temporary, 0o600); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
  }
}
