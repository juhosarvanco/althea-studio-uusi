import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, closeSync, fsyncSync,
  renameSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { schema, inlineHTML } from './schema.mjs';
import { FieldHistory, fieldHash } from './history.mjs';
import { EventEmitter } from 'node:events';
import { initialLayout, nextLayout, layoutView, withTargets } from './layout.mjs';

// A state vector alone misses deletion-only changes. A snapshot also encodes
// the canonical delete set, so durability and stale-action checks cover both.
export const vector = doc => Buffer.from(Y.encodeSnapshot(Y.snapshot(doc))).toString('base64');
const hash = bytes => createHash('sha256').update(bytes).digest();
const envelope = Buffer.from('ALTHEA-AUDIT-1\n');
const frame = (update, changes, layout) => {
  const payload = Buffer.concat([envelope, Buffer.from(JSON.stringify({ update: Buffer.from(update).toString('base64'), changes, ...(layout ? { layout } : {}) }))]);
  const header = Buffer.alloc(36); header.writeUInt32BE(payload.length); hash(payload).copy(header, 4);
  return Buffer.concat([header, payload]);
};
function atomic(path, bytes) {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
}

export class StudioStore extends EventEmitter {
  constructor(directory, manifest, template) {
    super();
    this.directory = directory; this.manifest = manifest; this.template = template;
    this.layout = initialLayout(manifest, template);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.lockPath = join(directory, 'server.lock');
    if (existsSync(this.lockPath)) {
      const pid = Number(readFileSync(this.lockPath, 'utf8'));
      let running = true; try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') running = false; }
      if (running) throw new Error('This data directory already has a running studio server.');
      unlinkSync(this.lockPath);
    }
    writeFileSync(this.lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
    try {
      this.doc = new Y.Doc(); this.journal = join(directory, 'updates.bin');
      this.history = new FieldHistory(manifest); let audited = false;
      if (existsSync(this.journal)) {
        const bytes = readFileSync(this.journal); let offset = 0;
        while (offset + 36 <= bytes.length) {
          const size = bytes.readUInt32BE(offset);
          if (size > 64 * 1024 * 1024) throw new Error('Stored document frame is too large; saved content has been preserved.');
          if (offset + 36 + size > bytes.length) break;
          const update = bytes.subarray(offset + 36, offset + 36 + size);
          if (!hash(update).equals(bytes.subarray(offset + 4, offset + 36)))
            throw new Error('Stored document checksum mismatch; preserve data and restore a checkpoint.');
          if (update.subarray(0, envelope.length).equals(envelope)) {
            const record = JSON.parse(update.subarray(envelope.length).toString());
            Y.applyUpdate(this.doc, Buffer.from(record.update, 'base64'));
            if (record.layout) this.layout = record.layout;
            this.history.accept(record.changes); audited = true;
          } else Y.applyUpdate(this.doc, update);
          offset += 36 + size;
        }
        // A crash may interrupt only the last append. Never discard earlier updates.
        if (offset < bytes.length) atomic(this.journal, bytes.subarray(0, offset));
      }
      // A persisted live layout is authoritative. A newly published matching
      // template may bootstrap future builds; unrelated file edits are rejected.
      if (![this.layout.bootstrapHash, this.layout.manifest.layoutHash].includes(manifest.layoutHash))
        throw new Error('Site layout changed. Migrate shared fields before restarting; saved content has been preserved.');
      this.layout.bootstrapHash = manifest.layoutHash;
      this.useLayout(this.layout);
      const meta = this.doc.getMap('meta');
      if (meta.get('layoutHash') && meta.get('layoutHash') !== this.manifest.layoutHash)
        throw new Error('Site layout changed. Migrate shared fields before restarting; saved content has been preserved.');
      if (!meta.get('layoutHash')) {
        this.doc.transact(() => {
          meta.set('layoutHash', manifest.layoutHash);
          meta.set('publicHash', manifest.sourceHash);
          for (const field of manifest.fields)
            prosemirrorJSONToYXmlFragment(schema, field.content, this.doc.getXmlFragment(field.id));
        });
      }
      this.comments = this.doc.getMap('comments');
      this.validate(this.doc);
      this.snapshotDirectory = join(directory, 'versions');
      mkdirSync(this.snapshotDirectory, { recursive: true, mode: 0o700 });
      if (!this.versions().length) this.checkpoint('Ensimmäinen versio', 'Althea');
      if (!audited) this.history.seed(this.versions().reverse().map(version =>
        JSON.parse(readFileSync(join(this.snapshotDirectory, `${version.id}.json`), 'utf8'))), this.fields());
      // One checksummed journal frame persists both the text and its authorship.
      // Older binary journals remain readable and migrate without resetting Yjs.
      atomic(this.journal, frame(Y.encodeStateAsUpdate(this.doc), this.history.all(), this.layout));
    } catch (error) { unlinkSync(this.lockPath); throw error; }
  }
  useLayout(layout) {
    layout = withTargets(layout);
    this.layout = layout; this.manifest = layout.manifest; this.template = layout.template;
    this.history.manifest = { fields: layout.catalog, layoutHash: layout.manifest.layoutHash };
  }
  validate(doc, layout = this.layout) {
    const known = new Set(['meta', 'comments', ...layout.catalog.map(field => field.id)]);
    if ([...doc.share.keys()].some(key => !known.has(key))) throw new Error('Unknown field');
    if (doc.getMap('meta').get('layoutHash') !== layout.manifest.layoutHash) throw new Error('Invalid layout');
    if (!/^[a-f0-9]{64}$/.test(doc.getMap('meta').get('publicHash'))) throw new Error('Invalid public baseline');
    for (const field of layout.catalog) {
      const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(field.id));
      schema.nodeFromJSON(json).check();
      if (JSON.stringify(json).length > 100000) throw new Error('Text too long');
      inlineHTML(json); // reject unsupported nodes/marks before accepting their update
    }
    const comments = doc.getMap('comments');
    if (comments.size > 1000) throw new Error('Too many comments');
    for (const [id, comment] of comments) {
      if (typeof id !== 'string' || id.length > 100 || !comment || JSON.stringify(comment).length > 8000
        || typeof comment.body !== 'string' || comment.body.length > 2000
        || typeof comment.author !== 'string' || comment.author.length > 100
        || typeof comment.createdAt !== 'string' || typeof comment.resolved !== 'boolean') throw new Error('Invalid comment');
      const anchor = comment.anchor || { kind: 'field', fieldId: comment.fieldId };
      if (anchor.kind === 'element') {
        if (!layout.targets?.some(target => target.id === anchor.nodeId) || JSON.stringify(anchor).length > 200) throw new Error('Invalid comment target');
      } else {
        if (!['field', 'text'].includes(anchor.kind) || comment.fieldId !== anchor.fieldId
          || !layout.catalog.some(field => field.id === anchor.fieldId)) throw new Error('Invalid comment field');
        if (anchor.kind === 'text') {
          if (typeof anchor.quote !== 'string' || !anchor.quote || anchor.quote.length > 2000) throw new Error('Invalid comment quote');
          for (const position of [anchor.from, anchor.to]) {
            if (!position || JSON.stringify(position).length > 1000
              || !['type', 'tname', 'item', 'assoc'].every(key => position[key] === undefined || key === 'tname' && typeof position[key] === 'string'
                || key === 'assoc' && Number.isSafeInteger(position[key]) || ['type', 'item'].includes(key)
                  && Number.isSafeInteger(position[key]?.client) && position[key].client >= 0 && Number.isSafeInteger(position[key]?.clock) && position[key].clock >= 0)
              || !position.type && !position.tname && !position.item
              || position.tname && position.tname !== anchor.fieldId) throw new Error('Invalid comment range');
            const absolute = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(position), doc);
            const field = doc.getXmlFragment(anchor.fieldId);
            if (absolute && absolute.type !== field && !Y.isParentOf(field, absolute.type._item)) throw new Error('Comment range belongs to another field');
          }
        }
      }
    }
  }
  apply(update, origin, actor = null, kind = 'edit', serverMetadata = false) {
    const candidate = new Y.Doc();
    let changes;
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
      Y.applyUpdate(candidate, update); this.validate(candidate);
      if (!serverMetadata && JSON.stringify(candidate.getMap('meta').toJSON()) !== JSON.stringify(this.doc.getMap('meta').toJSON()))
        throw new Error('Server-owned metadata cannot be edited');
      if (Y.encodeStateAsUpdate(candidate).length > 5 * 1024 * 1024) throw new Error('Document storage limit reached');
      changes = this.history.changes(this.fields(), this.fields(candidate), actor, kind);
    } finally { candidate.destroy(); }
    // Persist before making an update visible or acknowledging it to clients.
    appendFileSync(this.journal, frame(update, changes));
    const fd = openSync(this.journal, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }
    this.history.accept(changes);
    Y.applyUpdate(this.doc, update, origin);
  }
  fields(doc = this.doc) {
    return Object.fromEntries(this.layout.catalog.map(field => [field.id,
      yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(field.id))]));
  }
  layoutView() { return layoutView(this.layout); }
  applyLayout(html, expectedHash, actor) {
    const next = nextLayout(this.layout, html, expectedHash);
    if (next.manifest.layoutHash === this.manifest.layoutHash) return { ok: true, unchanged: true, layoutHash: this.manifest.layoutHash };
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
      const known = new Set(this.layout.catalog.map(field => field.id));
      candidate.transact(() => {
        candidate.getMap('meta').set('layoutHash', next.manifest.layoutHash);
        for (const field of next.catalog) if (!known.has(field.id))
          prosemirrorJSONToYXmlFragment(schema, field.content, candidate.getXmlFragment(field.id));
      });
      this.validate(candidate, next);
      if (Y.encodeStateAsUpdate(candidate).length > 5 * 1024 * 1024) throw new Error('Document storage limit reached');
      const after = Object.fromEntries(next.catalog.map(field => [field.id, yXmlFragmentToProsemirrorJSON(candidate.getXmlFragment(field.id))]));
      const history = new FieldHistory({ fields: next.catalog });
      const changes = history.changes(this.fields(), after, actor, 'layout');
      this.checkpoint('Ennen ulkoasupäivitystä', actor?.name || 'Althea');
      const update = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(this.doc));
      // One fsynced record commits layout, new fields and history together.
      appendFileSync(this.journal, frame(update, changes, next));
      const fd = openSync(this.journal, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }
      this.useLayout(next); this.history.accept(changes);
      Y.applyUpdate(this.doc, update, 'layout');
      this.emit('layout', this.layoutView());
      return { ok: true, layoutHash: next.manifest.layoutHash,
        added: next.catalog.filter(field => !known.has(field.id)).map(field => field.id),
        archived: next.catalog.filter(field => field.archivedAt).map(field => field.id) };
    } finally { candidate.destroy(); }
  }
  fieldHistory(fieldId) {
    this.history.field(fieldId);
    return this.history.view(fieldId, yXmlFragmentToProsemirrorJSON(this.doc.getXmlFragment(fieldId)));
  }
  restoreField(fieldId, id, expectedHash, versionHash, actor) {
    const entry = this.history.entry(fieldId, id);
    const current = yXmlFragmentToProsemirrorJSON(this.doc.getXmlFragment(fieldId));
    if (fieldHash(current) !== expectedHash || fieldHash(entry.after) !== versionHash) {
      const error = new Error('Tekstikohta tai valittu versio muuttui. Päivitä kohdan historia ja tarkista teksti ennen palauttamista.');
      error.status = 409; throw error;
    }
    if (fieldHash(current) === versionHash) return { ok: true, unchanged: true };
    const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
    candidate.transact(() => {
      const fragment = candidate.getXmlFragment(fieldId); fragment.delete(0, fragment.length);
      prosemirrorJSONToYXmlFragment(schema, entry.after, fragment);
    }, 'field-restore');
    try { this.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(this.doc)), 'field-restore', actor, 'restore'); }
    finally { candidate.destroy(); }
    return { ok: true, fieldId };
  }
  checkpoint(title, author) {
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const version = { id, title: String(title || 'Tallennettu versio').slice(0, 100), author,
      createdAt: new Date().toISOString(), layoutHash: this.manifest.layoutHash,
      fields: this.fields(), comments: this.comments.toJSON(), vector: vector(this.doc) };
    atomic(join(this.snapshotDirectory, `${id}.json`), JSON.stringify(version));
    const old = readdirSync(this.snapshotDirectory).filter(name => name.endsWith('.json')).sort().slice(0, -100);
    for (const name of old) unlinkSync(join(this.snapshotDirectory, name));
    return { ...version, fields: undefined, comments: undefined };
  }
  versions() {
    return readdirSync(this.snapshotDirectory).filter(name => /^\d+-[a-f0-9]+\.json$/.test(name)).sort().reverse().map(name => {
      const { fields, comments, ...version } = JSON.parse(readFileSync(join(this.snapshotDirectory, name), 'utf8'));
      return version;
    });
  }
  restore(id, expected, author) {
    if (!/^\d+-[a-f0-9]{8}$/.test(id)) throw new Error('Invalid version');
    if (expected !== vector(this.doc)) { const error = new Error('Sisältö muuttui. Tarkista uusin versio ennen palauttamista.'); error.status = 409; throw error; }
    const version = JSON.parse(readFileSync(join(this.snapshotDirectory, `${id}.json`), 'utf8'));
    if (version.layoutHash !== this.manifest.layoutHash) throw new Error('Incompatible version');
    this.checkpoint('Ennen version palauttamista', typeof author === 'object' ? author.name : author);
    const candidate = new Y.Doc();
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
    candidate.transact(() => {
      for (const field of this.manifest.fields) {
        const fragment = candidate.getXmlFragment(field.id); fragment.delete(0, fragment.length);
        prosemirrorJSONToYXmlFragment(schema, version.fields[field.id], fragment);
      }
      const comments = candidate.getMap('comments'); comments.clear(); for (const [key, value] of Object.entries(version.comments)) comments.set(key, value);
    }, 'restore');
    try { this.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(this.doc)), 'restore', author, 'restore'); } finally { candidate.destroy(); }
    return this.checkpoint(`Palautettu: ${version.title}`, typeof author === 'object' ? author.name : author);
  }
  export() {
    const { document } = parseHTML(this.template);
    for (const field of this.manifest.fields) {
      const el = document.querySelector(`[data-studio-field="${field.id}"]`);
      el.innerHTML = inlineHTML(yXmlFragmentToProsemirrorJSON(this.doc.getXmlFragment(field.id)));
    }
    return { html: '<!doctype html>\n' + document.documentElement.outerHTML,
      layoutHash: this.manifest.layoutHash, publicHash: this.doc.getMap('meta').get('publicHash'), vector: vector(this.doc) };
  }
  published(expected, next) {
    if (!/^[a-f0-9]{64}$/.test(next) || this.doc.getMap('meta').get('publicHash') !== expected) throw new Error('Publication baseline changed');
    const candidate = new Y.Doc(); Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
    candidate.getMap('meta').set('publicHash', next);
    try { this.apply(Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(this.doc)), 'publication', null, 'edit', true); } finally { candidate.destroy(); }
  }
  close() { this.doc.destroy(); if (existsSync(this.lockPath)) unlinkSync(this.lockPath); }
}
