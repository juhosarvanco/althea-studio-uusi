import { startGalleries } from "../site/gallery.js";
import { startContactForm } from './contact-form.js';
import { publicCopy } from './public-copy.js';
import contactFormStyles from '../site/contact-form.css';
import { applySiteIcons } from '../shared/site-icons.mjs';

(() => {
  const appURL = document.currentScript?.src || document.querySelector('script[src$="app.js"]')?.src || document.baseURI;
  applySiteIcons(document, new URL('.', appURL).href);
  const confirmationStyles = document.createElement('style');
  confirmationStyles.textContent = contactFormStyles;
  document.head.append(confirmationStyles);
  startGalleries();
  const $ = selector => document.querySelector(selector);
  const copy = publicCopy(document);
  // Each biography expands its own card, without stretching the adjacent card.
  for (const profiles of document.querySelectorAll('.profiles')) profiles.style.alignItems = 'start';
  const policy = $('#policy-dialog');
  for (const button of document.querySelectorAll('[data-policy]')) button.addEventListener('click', () => {
    const privacy = button.dataset.policy === 'privacy';
    $('#policy-title').textContent = privacy ? copy.privacyTitle : copy.termsTitle;
    $('#policy-copy').textContent = privacy ? copy.privacy : copy.terms;
    policy.showModal();
  });
  policy.querySelector('[data-close-dialog]').addEventListener('click', () => policy.close());

  startContactForm(document);

  const menu = $('.mobile-menu');
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });

  // One fixed image at a time. Switch only behind a panel covering the viewport.
  const backdrop = $('.photo-backdrop'), images = [...backdrop.querySelectorAll('img')];
  let measured = false, frame;
  const measure = (force = false) => {
    const headerHeight = $('.site-header').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-height', headerHeight + 'px');
    const y = window.scrollY;
    // The fixed photos end at the footer, including during elastic scrolling.
    const footerTop = $('.site-footer').getBoundingClientRect().top;
    backdrop.style.clipPath = `inset(0 0 ${Math.max(0, window.innerHeight - footerTop)}px 0)`;
    const coverage = panel => { const rect = panel.getBoundingClientRect(), radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0; return [y + rect.top + radius - headerHeight, y + rect.bottom - radius - window.innerHeight]; };
    const thresholds = [...document.querySelectorAll('.background-transition-panel')].map(panel => { const [a, b] = coverage(panel); return (a + b) / 2; });
    const wanted = thresholds.reduce((index, threshold, i) => y >= threshold ? i + 1 : index, 0);
    const covered = [...document.querySelectorAll('.text-panel')].some(panel => { const [a, b] = coverage(panel); return y >= a && y <= b; });
    if (images[wanted]?.complete && images[wanted].naturalWidth && (covered || force || !measured)) {
      images.forEach((image, index) => image.classList.toggle('is-active', index === wanted)); backdrop.dataset.active = String(wanted);
    }
    measured = true;
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => measure()); };
  window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', () => requestAnimationFrame(() => measure(true)));
  const observer = new ResizeObserver(schedule); observer.observe($('main')); observer.observe($('.site-header'));
  for (const image of images) image.addEventListener('load', schedule, { once: true });
  document.fonts?.ready.then(schedule); measure(true);
})();
