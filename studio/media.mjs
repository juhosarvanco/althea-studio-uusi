import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const cleanPath = value => String(value || '').replace(/^\//, '');
function atomic(path, bytes) {
  const fd = openSync(path + '.tmp', 'w', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(path + '.tmp', path);
}

// Only bounded, non-animated WebP data is accepted. The browser re-encodes
// uploads, removing original metadata and preventing executable image formats.
export function webpSize(bytes) {
  if (bytes.length < 20 || bytes.length > MAX_IMAGE_BYTES || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    fail('Kuva ei ole kelvollinen WebP-kuva tai se on liian suuri.');
  let dimensions, frameSeen = false, offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + size;
    if (end > bytes.length || !['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP'].includes(type)) fail('Kuvamuotoa ei tueta.');
    if (type === 'ICCP' && size > 64 * 1024) fail('Kuvan väriprofiili on liian suuri.');
    if (type === 'VP8X') {
      if (size !== 10 || bytes[start] & 0x02) fail('Liikkuvia kuvia ei tueta.');
      dimensions = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    } else if (type === 'VP8 ') {
      if (size < 10 || bytes.toString('hex', start + 3, start + 6) !== '9d012a') fail('Kuva ei ole kelvollinen.');
      const actual = { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
      if (dimensions && (actual.width !== dimensions.width || actual.height !== dimensions.height)) fail('Kuvan mitat ovat virheelliset.');
      dimensions = actual; frameSeen = true;
    } else if (type === 'VP8L') {
      if (size < 5 || bytes[start] !== 0x2f) fail('Kuva ei ole kelvollinen.');
      const bits = bytes.readUInt32LE(start + 1);
      const actual = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      if (dimensions && (actual.width !== dimensions.width || actual.height !== dimensions.height)) fail('Kuvan mitat ovat virheelliset.');
      dimensions = actual; frameSeen = true;
    }
    offset = end + (size % 2);
  }
  if (!frameSeen || offset !== bytes.length || !dimensions?.width || !dimensions.height
    || dimensions.width > 3072 || dimensions.height > 3072) fail('Kuva on liian suuri tai vioittunut.');
  return dimensions;
}

export class MediaLibrary {
  constructor(directory, site, template) {
    this.directory = join(directory, 'media'); this.site = site;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.indexPath = join(this.directory, 'library.json');
    this.entries = existsSync(this.indexPath) ? JSON.parse(readFileSync(this.indexPath, 'utf8')) : [];
    const { document } = parseHTML(template);
    for (const image of document.querySelectorAll('img[src]')) {
      const path = cleanPath(image.getAttribute('src'));
      if (!/^assets\/img\/[a-zA-Z0-9._-]+\.webp$/.test(path) || !existsSync(join(site, path))) continue;
      const bytes = readFileSync(join(site, path)), id = digest(bytes);
      if (this.entries.some(entry => entry.id === id || entry.path === path)) continue;
      this.entries.push({ id, path, name: basename(path).replace(/\.[a-f0-9]+\.webp$/, '').replace(/-/g, ' '),
        alt: image.getAttribute('alt') || '', bytes: bytes.length, uploaded: false, createdAt: null });
    }
    this.save();
  }
  save() { atomic(this.indexPath, JSON.stringify(this.entries)); }
  list() { return this.entries.map(entry => ({ ...entry })); }
  get(id) {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) fail('Kuvaa ei löydy.', 404);
    const entry = this.entries.find(item => item.id === id);
    if (!entry) fail('Kuvaa ei löydy.', 404);
    return entry;
  }
  read(id) {
    const entry = this.get(id);
    return readFileSync(entry.uploaded ? join(this.directory, `${entry.id}.webp`) : join(this.site, entry.path));
  }
  upload(bytes, name, actor) {
    const dimensions = webpSize(bytes), id = digest(bytes), existing = this.entries.find(entry => entry.id === id);
    if (existing) return { entry: existing, duplicate: true };
    if (this.entries.length >= 200 || this.entries.filter(entry => entry.uploaded).reduce((sum, entry) => sum + entry.bytes, 0) + bytes.length > 200 * 1024 * 1024)
      fail('Kuvapankin tallennustila on täynnä.', 413);
    const entry = { id, path: `assets/img/studio-${id}.webp`, name: basename(String(name || 'Uusi kuva')).slice(0, 100),
      alt: '', bytes: bytes.length, ...dimensions, uploaded: true, author: actor.name || actor.sub,
      createdAt: new Date().toISOString() };
    atomic(join(this.directory, `${id}.webp`), bytes);
    this.entries.push(entry); this.save(); return { entry, duplicate: false };
  }
  publicationAssets(html) {
    const { document } = parseHTML(html);
    const paths = new Set([...document.querySelectorAll('img[src]')].map(image => cleanPath(image.getAttribute('src'))));
    const entries = this.entries.filter(entry => entry.uploaded && paths.has(entry.path));
    if (entries.reduce((sum, entry) => sum + entry.bytes, 0) > 5 * 1024 * 1024)
      fail('Julkaisuun valittujen uusien kuvien koko ylittää 5 Mt. Käytä pienempiä kuvia.', 413);
    return entries.map(entry => ({ path: entry.path, digest: entry.id, content: this.read(entry.id).toString('base64') }));
  }
}

function imageState(image) {
  return { src: image.getAttribute('src') || '', srcset: image.getAttribute('srcset') || '',
    alt: image.getAttribute('alt') || '', position: image.style.objectPosition || '50% 50%' };
}
export function imageSlots(layout) {
  const { document } = parseHTML(layout.template);
  const backgrounds = [...document.querySelectorAll('.photo-backdrop img')];
  const panels = [...document.querySelectorAll('.background-transition-panel')];
  return [...document.querySelectorAll('main img[data-studio-node], header img[data-studio-node], footer img[data-studio-node]')].map(image => {
    const background = backgrounds.indexOf(image), section = background >= 0 ? background === 0
      ? document.querySelector('section.hero') : panels[background - 1] : image.closest('section');
    const heading = (background < 0 && image.closest('article')?.querySelector('h2,h3,h4')) || section?.querySelector('h1,h2,h3');
    const state = imageState(image);
    return { id: image.getAttribute('data-studio-node'), kind: background >= 0 ? 'background' : 'image',
      label: background === 0 ? 'Yläosan taustakuva' : heading?.textContent?.trim().slice(0, 100) || section?.getAttribute('data-screen-label') || 'Sivun kuva',
      headingField: heading?.getAttribute('data-studio-field') || null, sectionId: section?.id || null,
      ...state, imageHash: digest(JSON.stringify(state)) };
  });
}

export function changeImage(store, library, body, actor) {
  const slot = imageSlots(store.layout).find(item => item.id === body.nodeId);
  if (!slot) fail('Kuva-alue poistettiin. Valitse toinen alue.', 409);
  if (slot.imageHash !== body.imageHash) fail('Tätä kuvaa muutettiin juuri. Tarkista uusin kuva ja valitse uudelleen.', 409);
  if (typeof body.alt !== 'string' || body.alt.length > 500 || !/^\d{1,3}% \d{1,3}%$/.test(body.position || '')
    || body.position.split(' ').some(value => parseInt(value) > 100)) fail('Tarkista kuvan kuvaus ja rajaus.');
  const entry = library.get(body.mediaId), { document } = parseHTML(store.template);
  const image = document.querySelector(`[data-studio-node="${slot.id}"]`);
  image.setAttribute('src', entry.path); image.removeAttribute('srcset'); image.setAttribute('alt', body.alt);
  if (image.hasAttribute('data-portrait')) {
    image.removeAttribute('hidden');
    image.parentElement.querySelector('[data-portrait-placeholder]')?.setAttribute('hidden', '');
  }
  image.style.objectPosition = body.position;
  return store.applyLayout('<!doctype html>\n' + document.documentElement.outerHTML, store.manifest.layoutHash, actor);
}
