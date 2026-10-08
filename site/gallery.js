// Delegated controls also work after Studio replaces the live page layout.
export function startGalleries() {
  const positions = new Map();
  const visibleCount = gallery => Math.max(1, Number.parseInt(getComputedStyle(gallery).getPropertyValue('--gallery-visible'), 10) || 1);
  const render = (gallery, index = positions.get(gallery.id) || 0, preserveFocus = true) => {
    const slides = [...gallery.querySelectorAll('[data-gallery-slide]')];
    if (!slides.length) return;
    const count = visibleCount(gallery), pages = Math.ceil(slides.length / count);
    const page = Math.floor(index / count);
    let current = (((page % pages) + pages) % pages) * count;
    // Keep a caption being edited visible when the viewport or layout changes.
    const focused = slides.findIndex(slide => slide.contains(document.activeElement));
    if (preserveFocus && focused >= 0 && (focused < current || focused >= current + count)) current = Math.floor(focused / count) * count;
    positions.set(gallery.id, current);
    slides.forEach((slide, i) => { slide.hidden = i < current || i >= current + count; });
    const counter = gallery.querySelector('[data-gallery-counter]');
    const last = Math.min(current + count, slides.length);
    if (counter) counter.textContent = `${count > 1 ? `${current + 1}–${last}` : current + 1} / ${slides.length}`;
    for (const button of gallery.querySelectorAll('[data-gallery-step]')) button.disabled = pages < 2;
  };
  // An explicit navigation request wins over the previously focused caption.
  // Safari can leave the editor focused when a button is clicked.
  const step = (gallery, direction) => render(gallery, (positions.get(gallery.id) || 0) + direction * visibleCount(gallery), false);
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.target.closest('[data-gallery-step]');
    const gallery = button?.closest('[data-gallery]');
    if (!gallery) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    step(gallery, Number(button.dataset.galleryStep));
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const gallery = event.target.closest('[data-gallery]');
    if (!gallery || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    step(gallery, event.key === 'ArrowLeft' ? -1 : 1);
  });
  const refresh = () => document.querySelectorAll('[data-gallery]').forEach(gallery => render(gallery));
  window.addEventListener('resize', refresh);
  refresh();
  return refresh;
}
