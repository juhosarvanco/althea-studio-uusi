// Delegated controls also work after Studio replaces the live page layout.
export function startGalleries() {
  const positions = new Map();
  const render = (gallery, index = positions.get(gallery.id) || 0) => {
    const slides = [...gallery.querySelectorAll('[data-gallery-slide]')];
    if (!slides.length) return;
    const current = ((index % slides.length) + slides.length) % slides.length;
    positions.set(gallery.id, current);
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    const counter = gallery.querySelector('[data-gallery-counter]');
    if (counter) counter.textContent = `${current + 1} / ${slides.length}`;
    for (const button of gallery.querySelectorAll('[data-gallery-step]')) button.disabled = slides.length < 2;
  };
  const step = (gallery, direction) => render(gallery, (positions.get(gallery.id) || 0) + direction);
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.target.closest('[data-gallery-step]');
    const gallery = button?.closest('[data-gallery]');
    if (!gallery) return;
    event.preventDefault();
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
  refresh();
  return refresh;
}
