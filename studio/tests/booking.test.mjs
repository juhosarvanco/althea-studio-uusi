import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { addBookingSection, refineBookingContact } from '../../tools/booking-section.mjs';
import { startEmailDialog } from '../../tools/email-dialog.js';
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
    assert.ok(d.querySelector('.contact-email-option #contact-form, #contact-email-dialog #contact-form'));
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

test('contact review moves the original email form into a popup and keeps its editable fields', async () => {
  const styles = await readFile(new URL('../../tools/booking-section.css', import.meta.url), 'utf8');
  for (const lang of ['fi', 'en']) {
    const html = await readFile(new URL(`../../site/${lang === 'en' ? 'en/' : ''}index.html`, import.meta.url), 'utf8');
    const before = prepareTemplate(html);
    const removed = new Set([...before.document.querySelectorAll('.whatsapp-card p, .contact-email-option summary [data-studio-field]')].map(el => el.dataset.studioField));
    const result = refineBookingContact(html, styles), after = prepareTemplate(result, { newFieldIds: true });
    for (const field of before.manifest.fields) {
      if (removed.has(field.id)) continue;
      const selector = `[data-studio-field="${field.id}"]`;
      assert.equal(after.document.querySelector(selector)?.innerHTML, before.document.querySelector(selector).innerHTML, `Keep ${field.id}`);
    }
    const d = after.document;
    assert.equal(d.querySelectorAll('#contact-form').length, 1);
    assert.ok(d.querySelector('#contact-email-dialog #contact-form'));
    assert.equal(d.querySelector('.booking-fallback').hidden, true);
    assert.equal(d.querySelector('.booking-footnote').hidden, true);
    assert.equal(d.querySelector('.whatsapp-card p'), null);
    assert.equal(d.querySelector('.whatsapp-link').nextElementSibling, d.querySelector('[data-open-contact-email]'));
    assert.equal(d.querySelector('[data-open-contact-email]').textContent, lang === 'fi' ? 'Kirjoita sähköposti' : 'Send an email');
    assert.equal(d.querySelector('[data-open-contact-email]').href, 'mailto:info@althea.fi');
    assert.equal(refineBookingContact(result, styles), result);
  }
});

test('email popup opens without navigation, closes and returns focus without clearing the message', () => {
  const { document, Event } = parseHTML('<html><body><a href="mailto:info@althea.fi" data-open-contact-email>Email</a><dialog id="contact-email-dialog"><button data-close-contact-email>Close</button><textarea>Unsent message</textarea></dialog></body></html>');
  const dialog = document.querySelector('dialog'), opener = document.querySelector('a');
  let restored = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close', { bubbles: true })); };
  opener.focus = () => { restored = true; };
  startEmailDialog(document); startEmailDialog(document);
  const click = new Event('click', { bubbles: true, cancelable: true }); opener.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true); assert.equal(dialog.open, true);
  document.querySelector('button').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(dialog.open, false); assert.equal(restored, true);
  assert.equal(document.querySelector('textarea').value, 'Unsent message');
  assert.equal(document.documentElement.classList.contains('contact-email-open'), false);
});
