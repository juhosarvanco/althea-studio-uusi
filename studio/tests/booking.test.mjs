import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { addBookingSection } from '../../tools/booking-section.mjs';
import { startBooking, bookingLinks } from '../../tools/booking.js';
import { prepareTemplate } from '../template.mjs';

test('booking layout preserves every existing editable field and the working email form in both languages', async () => {
  const styles = await readFile(new URL('../../tools/booking-section.css', import.meta.url), 'utf8');
  for (const lang of ['fi', 'en']) {
    const html = await readFile(new URL(`../../site/${lang === 'en' ? 'en/' : ''}index.html`, import.meta.url), 'utf8');
    const before = prepareTemplate(html);
    const updated = addBookingSection(html, styles), after = prepareTemplate(updated, { newFieldIds: true });
    for (const field of before.manifest.fields) {
      const old = before.document.querySelector(`[data-studio-field="${field.id}"]`);
      const next = after.document.querySelector(`[data-studio-field="${field.id}"]`);
      assert.ok(next, `Preserve ${field.id}`); assert.equal(next.innerHTML, old.innerHTML);
    }
    const d = after.document;
    assert.equal(d.querySelectorAll('#contact-form').length, 1);
    assert.equal(d.querySelector('#contact-form').getAttribute('action'), 'https://formsubmit.co/info@althea.fi');
    assert.ok(d.querySelector('.contact-email-option #contact-form'));
    assert.equal(d.querySelector('.booking-fallback a').href, `https://cal.com/${bookingLinks[lang]}`);
    assert.ok(d.querySelector('.whatsapp-link').href.startsWith('https://wa.me/358407471234?text='));
    assert.equal(d.querySelectorAll('script').length, before.document.querySelectorAll('script').length);
    assert.equal(addBookingSection(updated, styles), updated);
  }
});

test('public embed uses the correct language link, exposes a fallback, and never forwards page queries', () => {
  for (const lang of ['fi', 'en']) {
    const { document, window } = parseHTML(`<html lang="${lang}"><head></head><body><div id="althea-booking-calendar" data-booking-calendar></div><p data-booking-status>Loading</p></body></html>`);
    startBooking(document, window);
    assert.equal(document.querySelector('script').src, 'https://app.cal.com/embed/embed.js');
    assert.equal(window.Cal.config.forwardQueryParams, false);
    const queue = window.Cal.ns[`althea-${lang}`].q;
    assert.equal([...queue.find(x => x[0] === 'inline')][1].calLink, bookingLinks[lang]);
    const on = queue.find(x => x[0] === 'on' && x[1].action === 'linkReady'); on[1].callback();
    assert.equal(document.querySelector('[data-booking-status]').hidden, true);
    document.querySelector('script').onerror();
    assert.equal(document.querySelector('[data-booking-status]').hidden, false);
    delete window.Cal;
  }
});

test('Studio never loads the external booking service', () => {
  const { document, window } = parseHTML('<html lang="fi" data-studio-language="fi"><head></head><body><div data-booking-calendar></div></body></html>');
  startBooking(document, window); assert.equal(document.querySelector('script'), null);
});
