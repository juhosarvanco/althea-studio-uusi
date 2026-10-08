// Delegated controls also work after Studio replaces the live page layout.
export function startGalleries() {
  const positions = new Map();
  const tracks = new Map();
  const visibleCount = gallery => Math.max(1, Number.parseInt(getComputedStyle(gallery).getPropertyValue('--gallery-visible'), 10) || 1);
  const render = (gallery, index = positions.get(gallery.id) || 0, preserveFocus = true, behavior = 'instant') => {
    const slides = [...gallery.querySelectorAll('[data-gallery-slide]')];
    if (!slides.length) return;
    const count = visibleCount(gallery), lastStart = Math.max(0, slides.length - count);
    let current = Math.max(0, Math.min(index, lastStart));
    // Keep a caption being edited visible when the viewport or layout changes.
    const focused = slides.findIndex(slide => slide.contains(document.activeElement));
    if (preserveFocus && focused >= 0 && (focused < current || focused >= current + count)) current = Math.min(focused, lastStart);
    positions.set(gallery.id, current);
    slides.forEach((slide, i) => {
      const outside = i < current || i >= current + count;
      slide.hidden = false;
      slide.inert = outside;
      slide.setAttribute('aria-hidden', String(outside));
    });
    const counter = gallery.querySelector('[data-gallery-counter]');
    const last = Math.min(current + count, slides.length);
    if (counter) counter.textContent = `${count > 1 ? `${current + 1}–${last}` : current + 1} / ${slides.length}`;
    for (const button of gallery.querySelectorAll('[data-gallery-step]'))
      button.disabled = Number(button.dataset.galleryStep) < 0 ? current === 0 : current === lastStart;
    const track = gallery.querySelector('.place-gallery-track');
    if (!track) return;
    let state = tracks.get(gallery.id);
    if (state?.track !== track) {
      clearTimeout(state?.settled);
      state?.observer?.disconnect();
      state = { track, width: track.clientWidth };
      tracks.set(gallery.id, state);
      // Touch scrolling and arrow clicks share the same position and controls.
      track.addEventListener('scroll', () => {
        clearTimeout(state.settled);
        state.settled = setTimeout(() => {
          if (!track.isConnected) return;
          const stride = slides[1]?.offsetLeft - slides[0].offsetLeft;
          if (stride > 0) render(gallery, Math.round(track.scrollLeft / stride), false);
        }, 160);
      }, { passive: true });
      // Opening a Studio sidebar changes the track width without resizing the window.
      if (typeof ResizeObserver !== 'undefined') {
        state.observer = new ResizeObserver(([entry]) => {
          if (!track.isConnected) { state.observer.disconnect(); return; }
          if (entry.contentRect.width === state.width) return;
          state.width = entry.contentRect.width;
          render(gallery);
        });
        state.observer.observe(track);
      }
    }
    // An earlier animation's delayed scroll event must not cancel a new click.
    clearTimeout(state.settled);
    track.scrollTo({ left: slides[current].offsetLeft - slides[0].offsetLeft, behavior });
  };
  // An explicit navigation request wins over the previously focused caption.
  // Safari can leave the editor focused when a button is clicked.
  const step = (gallery, direction) => render(gallery, (positions.get(gallery.id) || 0) + direction, false,
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.target.closest('[data-gallery-step]');
    const gallery = button?.closest('[data-gallery]');
    if (!gallery || button.disabled) return;
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
