import { parseHTML } from 'linkedom';
import { createHash, randomUUID } from 'node:crypto';
import { prepareTargets } from './targets.mjs';

const INLINE = new Set(['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'BR', 'SMALL', 'SUP', 'SUB']);
export function prepareTemplate(source, { newFieldIds = false } = {}) {
  const { document } = parseHTML(source);
  const manifest = { version: 1, fields: [], sourceHash: createHash('sha256').update(source).digest('hex') }, counts = new Map();
  function toJSON(element) {
    const nodes = [];
    const walk = (node, marks = []) => {
      if (node.nodeType === 3) { if (node.data) nodes.push({ type: 'text', text: node.data, ...(marks.length ? { marks } : {}) }); return; }
      if (node.tagName === 'BR') { nodes.push({ type: 'hardBreak' }); return; }
      const next = [...marks];
      if (['STRONG', 'B'].includes(node.tagName)) next.push({ type: 'bold' });
      if (['EM', 'I'].includes(node.tagName)) next.push({ type: 'italic' });
      if (node.tagName === 'A') next.push({ type: 'link', attrs: { href: node.getAttribute('href') || '#' } });
      for (const child of node.childNodes) walk(child, next);
    };
    for (const child of element.childNodes) walk(child);
    return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] };
  }
  for (const el of document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main span, main .pair-reasons strong, main a, footer p, footer span, footer a, footer div')) {
    if (el.closest('[aria-hidden="true"], [data-studio-ignore], [data-studio-chrome]') || el.matches('.pair-reasons li')
      || el.parentElement?.closest('[data-studio-field]')) continue;
    if (el.matches('span, a, strong, footer div') && el.children.length) continue;
    if (!el.hasAttribute('data-studio-field') && !el.textContent.trim()) continue;
    if ([...el.children].some(child => !INLINE.has(child.tagName))) continue;
    const section = el.closest('section[id]'), sectionId = section?.id || 'alatunniste';
    const key = `${sectionId}-${el.tagName.toLowerCase()}`; counts.set(key, (counts.get(key) || 0) + 1);
    const id = el.getAttribute('data-studio-field') || (newFieldIds ? `field-${randomUUID()}` : `${key}-${counts.get(key)}`);
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(id) || ['meta', 'comments'].includes(id)
      || manifest.fields.some(field => field.id === id)) throw new Error('Invalid or duplicate text field ID');
    el.setAttribute('data-studio-field', id); el.setAttribute('oai-annotation-container', '');
    el.setAttribute('oai-annotatable', id);
    el.setAttribute('oai-annotation-metadata', JSON.stringify({ fieldId: id, document: 'althea' }));
    manifest.fields.push({ id, section: section?.getAttribute('data-screen-label') || 'Alatunniste',
      tag: el.tagName.toLowerCase(), content: toJSON(el) });
  }
  if (document.querySelectorAll('[data-studio-field]').length !== manifest.fields.length)
    throw new Error('Text fields must be distinct supported leaf elements');
  prepareTargets(document, { newIds: newFieldIds });
  const template = '<!doctype html>\n' + document.documentElement.outerHTML;
  manifest.layoutHash = layoutHash(template);
  return { document, manifest, template };
}

export function layoutHash(html) {
  const { document } = parseHTML(html);
  // Annotation identity does not change the layout or invalidate old drafts.
  for (const el of document.querySelectorAll('[data-studio-node]')) el.removeAttribute('data-studio-node');
  for (const el of document.querySelectorAll('[data-studio-field]')) el.innerHTML = `@${el.getAttribute('data-studio-field')}`;
  return createHash('sha256').update(document.documentElement.outerHTML).digest('hex');
}
