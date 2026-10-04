import { prepareTemplate } from './template.mjs';
import { parseHTML } from 'linkedom';
import { prepareTargets } from './targets.mjs';

export function withTargets(layout) {
  if (layout.targets) return layout;
  const { document } = parseHTML(layout.template);
  const targets = prepareTargets(document).map(target => ({ ...target, archivedAt: null }));
  return { ...layout, template: '<!doctype html>\n' + document.documentElement.outerHTML, targets };
}

export function initialLayout(manifest, template) {
  return withTargets({ manifest, template, bootstrapHash: manifest.layoutHash,
    catalog: manifest.fields.map(field => ({ ...field, archivedAt: null })) });
}

// Only the trusted local operator can supply page markup. Ordinary editors
// cannot write this structure, the field catalog, or publication metadata.
export function nextLayout(current, html, expectedHash) {
  if (expectedHash !== current.manifest.layoutHash) {
    const error = new Error('Rakenne muuttui. Lataa uusin rakenne ennen päivitystä.'); error.status = 409; throw error;
  }
  if (typeof html !== 'string' || Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('Invalid layout size');
  const prepared = prepareTemplate(html, { newFieldIds: true });
  if (!prepared.document.querySelector('main') || !prepared.manifest.fields.length) throw new Error('Layout requires a main element and text fields');
  const scripts = source => [...parseHTML(source).document.querySelectorAll('script')]
    .filter(el => el.getAttribute('type') !== 'application/json').map(el => el.outerHTML);
  if (JSON.stringify(scripts(html)) !== JSON.stringify(scripts(current.template)))
    throw new Error('Sivun ohjelmakoodin muuttaminen vaatii erillisen käyttöliittymäpäivityksen. Alueita, kuvia ja tyylejä voi muuttaa suoraan.');
  const active = new Map(prepared.manifest.fields.map(field => [field.id, field]));
  const now = new Date().toISOString();
  const catalog = current.catalog.map(field => {
    const next = active.get(field.id);
    if (next && next.tag !== field.tag) throw new Error(`Säilytä tekstikohdan ${field.id} elementtityyppi tai luo uusi tekstikohta.`);
    return next ? { ...next, archivedAt: null } : { ...field, archivedAt: field.archivedAt || now };
  });
  const known = new Set(catalog.map(field => field.id));
  for (const field of prepared.manifest.fields) if (!known.has(field.id)) catalog.push({ ...field, archivedAt: null });
  if (catalog.length > 1500) throw new Error('Text field catalog limit reached');
  const nodes = prepareTargets(prepared.document), nodeMap = new Map(nodes.map(node => [node.id, node]));
  const targets = withTargets(current).targets.map(target => {
    const next = nodeMap.get(target.id);
    if (next && next.tag !== target.tag) throw new Error('Säilytä sivukohteen tyyppi tai anna uudelle kohteelle uusi tunniste.');
    return next ? { ...next, archivedAt: null } : { ...target, archivedAt: target.archivedAt || now };
  });
  const knownNodes = new Set(targets.map(target => target.id));
  for (const node of nodes) if (!knownNodes.has(node.id)) targets.push({ ...node, archivedAt: null });
  if (targets.length > 6000) throw new Error('Page object catalog limit reached');
  return { ...current, manifest: prepared.manifest, template: prepared.template, catalog, targets };
}

export function layoutView(layout) {
  return { layoutHash: layout.manifest.layoutHash, html: layout.template, targets: layout.targets,
    fields: layout.manifest.fields.map(({ id, section, tag }) => ({ id, section, tag })),
    archived: layout.catalog.filter(field => field.archivedAt).map(({ id, section, tag, archivedAt }) => ({ id, section, tag, archivedAt })) };
}
