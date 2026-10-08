// Reuse the actual editor elements rather than rendering saved text over them.
// Their Yjs bindings, selections and undo managers survive a layout move.
import { sitePath } from './config.js';
import { startGalleries } from '../site/gallery.js';

export function reconcileLayout(layout, editors, prepareImages = () => {}) {
  const incoming = new DOMParser().parseFromString(layout.html, 'text/html');
  prepareImages(incoming);
  const focused = [...editors.entries()].find(([, editor]) => editor.view.hasFocus());
  const anchor = focused?.[1].options.element;
  const top = anchor?.getBoundingClientRect().top;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const currentBackground = document.querySelector('.photo-backdrop')?.dataset.active;
  const openDetails = new Set([...document.querySelectorAll('main details[open]')]
    .map(el => el.id || el.querySelector('[data-studio-field]')?.dataset.studioField));
  const forms = new Map([...document.querySelectorAll('main input[id], main textarea[id]')]
    .map(el => [el.id, { value: el.value, checked: el.checked }]));
  for (const el of incoming.querySelectorAll('[src], [href], [srcset]')) {
    for (const name of ['src', 'href', 'srcset']) {
      const value = el.getAttribute(name);
      if (value?.startsWith('assets/')) el.setAttribute(name, value.replace(/(^|,\s*)assets\//g, `$1${sitePath('assets/')}`));
      if (name === 'href' && value === 'original.html') el.setAttribute(name, sitePath(value));
      if (name === 'href' && value === 'studio/') el.setAttribute(name, sitePath(value));
    }
  }
  for (const el of incoming.querySelectorAll('[data-studio-field]')) {
    const editor = editors.get(el.dataset.studioField);
    if (!editor) continue;
    const live = editor.options.element;
    const chromeClasses = [...live.classList].filter(name => name.startsWith('studio-'));
    for (const attr of [...live.attributes]) live.removeAttribute(attr.name);
    for (const attr of [...el.attributes]) live.setAttribute(attr.name, attr.value);
    live.classList.add(...chromeClasses);
    el.replaceWith(live);
  }
  const dock = document.querySelector('#studio-archive-dock');
  const storage = document.querySelector('#studio-archived-fields');
  const active = new Set(layout.fields.map(field => field.id));
  for (const [id, editor] of editors) {
    if (active.has(id)) continue;
    if (id === focused?.[0]) {
      dock.hidden = false; dock.querySelector('[data-archive-editor]').append(editor.options.element);
    } else storage.append(editor.options.element);
  }
  if (focused && active.has(focused[0])) dock.hidden = true;
  for (const tag of ['header', 'main', 'footer']) {
    const next = incoming.body.querySelector(`:scope > ${tag}`);
    const current = document.body.querySelector(`:scope > ${tag}`);
    if (next && current) current.replaceWith(next);
    else if (next) document.body.insertBefore(next, document.querySelector('[data-studio-chrome]'));
    else current?.remove();
  }
  const backdrop = document.querySelector('.photo-backdrop');
  if (backdrop && currentBackground !== undefined) {
    backdrop.dataset.active = currentBackground;
    backdrop.querySelectorAll('img').forEach((image, i) => image.classList.toggle('is-active', i === Number(currentBackground)));
  }
  const styles = [...incoming.head.querySelectorAll('style')].map(el => {
    el.dataset.studioSiteStyle = '';
    el.textContent = el.textContent.replace(/url\((['"]?)assets\//g, `url($1${sitePath('assets/')}`); return el;
  });
  document.querySelectorAll('head style[data-studio-site-style]').forEach(el => el.remove());
  const studioCSS = document.querySelector('link[href$="/studio/studio.css"]');
  for (const style of styles) document.head.insertBefore(style, studioCSS);
  for (const el of document.querySelectorAll('main details'))
    if (openDetails.has(el.id || el.querySelector('[data-studio-field]')?.dataset.studioField)) el.open = true;
  for (const el of document.querySelectorAll('main input[id], main textarea[id]')) {
    const previous = forms.get(el.id); if (previous) { el.value = previous.value; el.checked = previous.checked; }
  }
  if (focused) {
    // Focus the same ProseMirror view: no content replacement, no new undo stack.
    focused[1].view.focus();
    window.scrollTo(scroll.x, Math.max(0, scroll.y + (anchor?.getBoundingClientRect().top - top || 0)));
  } else window.scrollTo(scroll.x, scroll.y);
}

// Studio owns page interactions so they always query the current live layout.
// The public page retains its original standalone background implementation.
export function startPageBehavior() {
  const refreshGalleries = startGalleries();
  let observer, frame, measured = false;
  const measure = (force = false) => {
    const backdrop = document.querySelector('.photo-backdrop');
    const header = document.querySelector('.site-header');
    if (!backdrop || !header) return;
    const y = window.scrollY, visibleTop = header.getBoundingClientRect().bottom;
    const radius = Number.parseFloat(getComputedStyle(document.querySelector('main')).getPropertyValue('--panel-radius')) || 64;
    const coverage = panel => {
      const rect = panel.getBoundingClientRect();
      const panelRadius = Number.parseFloat(getComputedStyle(panel).borderTopLeftRadius) || radius;
      return [y + rect.top + panelRadius - visibleTop, y + rect.bottom - panelRadius - window.innerHeight];
    };
    const panels = [...document.querySelectorAll('.background-transition-panel')];
    const thresholds = panels.map(panel => { const [start, end] = coverage(panel); return (start + end) / 2; });
    const desired = thresholds.reduce((index, threshold, i) => y >= threshold ? i + 1 : index, 0);
    const current = Number(backdrop.dataset.active || 0);
    const covered = [...document.querySelectorAll('main .text-panel')].some(panel => {
      const [start, end] = coverage(panel); return y >= start && y <= end;
    });
    const images = [...backdrop.querySelectorAll('img')], next = images[desired];
    if (next?.complete && next.naturalWidth && (current === desired || covered || force || !measured)) {
      images.forEach((image, i) => image.classList.toggle('is-active', i === desired)); backdrop.dataset.active = String(desired);
    }
    measured = true;
    const main = document.querySelector('main'), height = `${visibleTop}px`;
    if (document.documentElement.style.getPropertyValue('--header-height') !== height) document.documentElement.style.setProperty('--header-height', height);
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
  const refresh = () => {
    refreshGalleries();
    observer?.disconnect(); observer = new ResizeObserver(schedule);
    const main = document.querySelector('main'); if (main) observer.observe(main);
    const header = document.querySelector('.site-header'); if (header) observer.observe(header);
    document.querySelectorAll('.photo-backdrop img').forEach(img => img.addEventListener('load', schedule, { once: true }));
    schedule();
  };
  window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', () => measure(true));
  document.fonts?.ready.then(schedule);
  document.addEventListener('click', event => { const menu = event.target.closest('.mobile-menu'); if (menu && event.target.closest('a')) menu.open = false; });
  document.addEventListener('keydown', event => {
    const menu = event.target.closest('.mobile-menu'); if (menu && event.key === 'Escape') { menu.open = false; menu.querySelector('summary')?.focus(); }
  });
  refresh(); return refresh;
}
