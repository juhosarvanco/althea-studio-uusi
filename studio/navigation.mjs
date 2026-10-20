import { parseHTML } from 'linkedom';
import { HEADER_FIELDS } from './template.mjs';

// Upgrade the authoritative shared layout, never the text from a public build.
// Existing fields, comments, unpublished edits and publication hashes survive.
export function enableHeaderEditing(store) {
  const { document } = parseHTML(store.template);
  const missing = [...document.querySelectorAll(HEADER_FIELDS)].some(el =>
    !el.hasAttribute('data-studio-field') && !el.closest('[data-studio-field], [aria-hidden="true"], [data-studio-ignore]')
    && !el.children.length && el.textContent.trim());
  if (!missing) return { unchanged: true };
  return store.applyLayout(store.export().html, store.manifest.layoutHash,
    { sub: 'althea-layout', name: 'Valikkotekstien muokkaus' });
}
