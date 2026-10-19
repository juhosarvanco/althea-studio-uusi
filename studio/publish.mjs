import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareTemplate } from './template.mjs';
import { vector } from './store.mjs';

export const REPOSITORY = 'juhosarvanco/althea-studio-uusi';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

export function githubRequest(path, body, method = body ? 'POST' : 'GET') {
  if (!path.startsWith(`/repos/${REPOSITORY}/`)) throw new Error('Publishing is restricted to the new repository.');
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['api', path, '--method', method, ...(body ? ['--input', '-'] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', size = 0; const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
    child.stdout.on('data', bytes => { size += bytes.length; if (size > 12 * 1024 * 1024) child.kill('SIGTERM'); else output += bytes; });
    // Never relay credentials or GitHub's raw error output to the browser.
    child.stderr.resume();
    child.once('error', () => { clearTimeout(timer); reject(new Error('GitHub-yhteys ei ole käytettävissä tällä palvelimella.')); });
    child.once('close', code => { clearTimeout(timer); if (code) reject(new Error('GitHub-julkaisu epäonnistui. Tarkista palvelimen GitHub-kirjautuminen tai mahdollinen rinnakkainen julkaisu.')); else { try { resolve(JSON.parse(output)); } catch { reject(new Error('GitHub palautti virheellisen vastauksen.')); } } });
    child.stdin.on('error', () => {}); child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}

export class GithubPublisher {
  constructor({ store, media, site, request = githubRequest }) { this.store = store; this.media = media; this.site = site; this.request = request; this.busy = false; }
  async publish(body, actor) {
    if (this.busy) fail('Julkaisu on jo käynnissä. Odota hetki.', 409);
    if (typeof body.vector !== 'string' || body.vector !== vector(this.store.doc)) fail('Sisältö muuttui. Odota tallennusta ja tarkista työversio.', 409);
    const snapshot = this.store.export();
    if (body.layoutHash !== snapshot.layoutHash || prepareTemplate(snapshot.html).manifest.layoutHash !== snapshot.layoutHash)
      fail('Ulkoasu muuttui. Tarkista uusin Studio ennen julkaisua.', 409);
    this.busy = true;
    try {
      const prefix = `/repos/${REPOSITORY}`, branch = 'main';
      const reference = await this.request(`${prefix}/git/ref/heads/${branch}`), parent = reference.object.sha;
      const file = await this.request(`${prefix}/contents/site/index.html?ref=${parent}`);
      if (file.encoding !== 'base64' || digest(Buffer.from(file.content.replace(/\n/g, ''), 'base64')) !== snapshot.publicHash)
        fail('Sivustoa muutettiin GitHubissa Studion ulkopuolella. Työversio säilyy; yhdistä muutokset ennen julkaisua.', 409);
      const htmlHash = digest(snapshot.html);
      if (htmlHash === snapshot.publicHash) return { unchanged: true, baselineUpdated: true };
      const assets = this.media.publicationAssets(snapshot.html);
      const commit = await this.request(`${prefix}/git/commits/${parent}`);
      const tree = [{ path: 'site/index.html', mode: '100644', type: 'blob', content: snapshot.html }];
      for (const asset of assets) {
        if (!/^assets\/img\/studio-[a-f0-9]{64}\.webp$/.test(asset.path) || digest(Buffer.from(asset.content, 'base64')) !== asset.digest)
          fail('Julkaisun kuvassa on virhe.');
        const blob = await this.request(`${prefix}/git/blobs`, { content: asset.content, encoding: 'base64' });
        tree.push({ path: `site/${asset.path}`, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const nextTree = await this.request(`${prefix}/git/trees`, { base_tree: commit.tree.sha, tree });
      const nextCommit = await this.request(`${prefix}/git/commits`, {
        message: `Studion yhteisen työversion julkaisu (${actor.sub})`, tree: nextTree.sha, parents: [parent],
        author: { name: actor.name, email: `${actor.sub}@users.noreply.github.com` } });
      // A concurrent commit cannot be overwritten: never force-advance the branch.
      await this.request(`${prefix}/git/refs/heads/${branch}`, { sha: nextCommit.sha, force: false }, 'PATCH');
      this.store.published(snapshot.publicHash, htmlHash);
      this.store.checkpoint('Julkaistu GitHub Pagesiin', actor.name);
      // Keep the local bootstrap in step with publications for future restarts.
      await writeFile(join(this.site, 'index.html.next'), snapshot.html);
      await rename(join(this.site, 'index.html.next'), join(this.site, 'index.html'));
      for (const asset of assets) {
        const target = join(this.site, asset.path); await writeFile(target + '.next', Buffer.from(asset.content, 'base64')); await rename(target + '.next', target);
      }
      return { baselineUpdated: true, commit: `https://github.com/${REPOSITORY}/commit/${nextCommit.sha}`, website: 'https://juhosarvanco.github.io/althea-studio-uusi/' };
    } finally { this.busy = false; }
  }
}
