import { createHash, randomUUID } from 'node:crypto';
import { inlineHTML } from './schema.mjs';

export const fieldHash = content => createHash('sha256').update(JSON.stringify(content ?? null)).digest('hex');
const bytes = record => Buffer.byteLength(JSON.stringify(record));
const authorOf = actor => actor && typeof actor === 'object'
  ? { login: actor.sub || actor.login, name: actor.name || actor.sub || actor.login } : null;
const describe = content => content ? { hash: fieldHash(content), html: inlineHTML(content),
  text: (content.content[0].content || []).map(node => node.type === 'hardBreak' ? '\n' : node.text || '').join('') } : null;

// Audit records belong to the server, outside the client-writable Yjs document.
// Consecutive typing by one person is one revision, up to a minute long.
export class FieldHistory {
  constructor(manifest) {
    this.manifest = manifest; this.records = new Map(); this.size = 0;
  }
  all() { return [...this.records.values()].flat(); }
  accept(records) {
    for (const record of records) {
      const list = this.records.get(record.fieldId) || [];
      const index = list.findIndex(previous => previous.id === record.id);
      if (index >= 0) { this.size -= bytes(list[index]); list[index] = record; }
      else list.push(record);
      this.size += bytes(record);
      while (list.length > 100) this.size -= bytes(list.shift());
      this.records.set(record.fieldId, list);
    }
    // Bound the retained audit data as well as the per-field revision count.
    while (this.size > 20 * 1024 * 1024) {
      const oldest = [...this.records.values()].filter(list => list.length > 1)
        .sort((a, b) => a[0].updatedAt.localeCompare(b[0].updatedAt))[0];
      if (!oldest) break;
      this.size -= bytes(oldest.shift());
    }
  }
  seed(versions, fields) {
    for (const version of versions) {
      if (version.layoutHash !== this.manifest.layoutHash) continue;
      for (const field of this.manifest.fields) {
        const after = version.fields[field.id]; if (!after) continue;
        const before = this.records.get(field.id)?.at(-1)?.after || null;
        if (before && fieldHash(before) === fieldHash(after)) continue;
        this.accept([{ id: `snapshot-${version.id}`, fieldId: field.id, before, after,
          author: null, kind: 'snapshot', title: version.title,
          createdAt: version.createdAt, updatedAt: version.createdAt }]);
      }
    }
    const now = new Date().toISOString();
    for (const field of this.manifest.fields) {
      const before = this.records.get(field.id)?.at(-1)?.after || null, after = fields[field.id];
      if (before && fieldHash(before) === fieldHash(after)) continue;
      this.accept([{ id: `baseline-${randomUUID()}`, fieldId: field.id, before, after,
        author: null, kind: 'baseline', title: 'Työversio historian käyttöönottohetkellä', createdAt: now, updatedAt: now }]);
    }
  }
  changes(before, after, actor, kind = 'edit') {
    const result = [], now = new Date().toISOString(), author = authorOf(actor);
    for (const field of this.manifest.fields) {
      if (fieldHash(before[field.id]) === fieldHash(after[field.id])) continue;
      const previous = this.records.get(field.id)?.at(-1);
      const grouped = kind === 'edit' && previous?.kind === 'edit' && author?.login
        && previous.author?.login === author.login && fieldHash(previous.after) === fieldHash(before[field.id])
        && Date.parse(now) - Date.parse(previous.updatedAt) < 15000
        && Date.parse(now) - Date.parse(previous.createdAt) < 60000;
      result.push({ id: grouped ? previous.id : randomUUID(), fieldId: field.id,
        before: grouped ? previous.before : before[field.id] || null, after: after[field.id], author, kind,
        createdAt: grouped ? previous.createdAt : now, updatedAt: now });
    }
    return result;
  }
  field(fieldId) {
    const field = this.manifest.fields.find(field => field.id === fieldId);
    if (!field) { const error = new Error('Tekstikohtaa ei löydy.'); error.status = 404; throw error; }
    return field;
  }
  entry(fieldId, id) {
    this.field(fieldId);
    const entry = this.records.get(fieldId)?.find(record => record.id === id);
    if (!entry) { const error = new Error('Tätä tekstiversiota ei enää löydy historiasta.'); error.status = 404; throw error; }
    return entry;
  }
  view(fieldId, current) {
    const field = this.field(fieldId);
    return { fieldId, section: field.section, current: describe(current),
      entries: [...(this.records.get(fieldId) || [])].reverse().map(record => ({ ...record,
        before: describe(record.before), after: describe(record.after) })) };
  }
}
