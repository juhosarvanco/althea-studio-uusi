import { createHash, randomUUID } from 'node:crypto';

// These IDs belong to page objects, not to pixels or their current position.
// Initial IDs are deterministic for legacy pages; later exports carry them.
export function prepareTargets(document, { newIds = false } = {}) {
  const targets = [], used = new Set();
  for (const el of document.querySelectorAll('header, main, footer, header *, main *, footer *')) {
    if (el.hasAttribute('data-studio-field') || el.parentElement?.closest('[data-studio-field]')
      || el.closest('svg, [data-studio-chrome]')
      || !el.matches('header, main, footer, section, article, div, figure, img, nav, a, button, details, summary, form, input, textarea, label, select, ul, ol, li')) continue;
    const path = []; let parent = el;
    while (parent && parent !== document.body) {
      path.unshift(`${parent.tagName}:${[...parent.parentElement.children].indexOf(parent)}`); parent = parent.parentElement;
    }
    const id = el.getAttribute('data-studio-node') || (newIds ? `node-${randomUUID()}`
      : `node-${createHash('sha256').update(path.join('/')).digest('hex').slice(0, 24)}`);
    if (!/^node-[a-zA-Z0-9_-]{1,80}$/.test(id) || used.has(id)) throw new Error('Invalid or duplicate page object ID');
    used.add(id); el.setAttribute('data-studio-node', id);
    const section = el.closest('section[id]');
    const title = el.getAttribute('aria-label') || el.getAttribute('alt')
      || el.querySelector('h1,h2,h3,h4')?.textContent || el.id || el.textContent;
    targets.push({ id, tag: el.tagName.toLowerCase(), label: String(title || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 140),
      section: section?.getAttribute('data-screen-label') || (el.closest('header') ? 'Valikko' : el.closest('footer') ? 'Alatunniste' : 'Sivu') });
  }
  if (document.querySelectorAll('[data-studio-node]').length !== targets.length) throw new Error('Unsupported page object ID');
  if (targets.length > 3000) throw new Error('Page object limit reached');
  return targets;
}
