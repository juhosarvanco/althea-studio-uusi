import test from 'node:test';
import assert from 'node:assert/strict';
import { sendContactRequest } from '../../tools/contact-form.js';
import { startContactForm } from '../../tools/contact-form.js';
import { publicCopy } from '../../tools/public-copy.js';
import { parseHTML } from 'linkedom';

test('contact submissions go to the email service with the visitor reply address', async () => {
  const data = new FormData();
  data.set('name', 'Website test'); data.set('email', 'visitor@example.org'); data.set('message', 'Hello');
  await sendContactRequest('https://formsubmit.co/info@althea.fi', data, async (url, options) => {
    assert.equal(url, 'https://formsubmit.co/ajax/info@althea.fi');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('email'), 'visitor@example.org');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ success: 'true' });
  });
});

test('activation requirements, rejected messages, and service failures never report a successful send', async () => {
  for (const response of [
    Response.json({ success: 'false', message: 'Activate your form' }),
    Response.json({ success: false }),
    Response.json({ success: 'true' }, { status: 500 }),
    new Response('Unavailable', { status: 503 }),
  ]) await assert.rejects(sendContactRequest('https://formsubmit.co/info@althea.fi', new FormData(), async () => response));
  await assert.rejects(sendContactRequest('https://formsubmit.co/info@althea.fi', new FormData(), async () => { throw new TypeError('Network unavailable'); }));
});

test('contact delivery refuses unrelated or unencrypted endpoints', async () => {
  for (const action of ['http://formsubmit.co/info@althea.fi', 'https://example.org/form'])
    await assert.rejects(sendContactRequest(action, new FormData(), () => { assert.fail('Must not submit'); }));
});

test('English form messages preserve details on failure and clear them only after a successful retry', async t => {
  const { document, Event } = parseHTML('<html lang="en"><body><form id="contact-form"><input name="name" value="Review test"><input name="email" value="visitor@example.org"><button type="submit">Send your request</button></form><p id="contact-status"></p></body></html>');
  const form = document.querySelector('form');
  form.action = 'https://formsubmit.co/info@althea.fi';
  form.reportValidity = () => true;
  form.reset = () => { for (const input of form.querySelectorAll('input')) input.value = ''; };
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class extends OriginalFormData {
    constructor(form) { super(); for (const input of form.querySelectorAll('input')) this.set(input.name, input.value); }
  };
  t.after(() => { globalThis.FormData = OriginalFormData; });
  let finish;
  startContactForm(document, () => new Promise(resolve => { finish = resolve; }));
  const status = document.querySelector('#contact-status'), button = form.querySelector('button');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(button.textContent, 'Sending…');
  assert.equal(form.getAttribute('aria-busy'), 'true');
  finish(Response.json({ success: 'false' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status.textContent, publicCopy(document).error);
  assert.notEqual(form.dataset.state, 'success');
  assert.equal(button.hidden, false);
  assert.equal(form.querySelector('input').value, 'Review test');
  assert.equal(button.textContent, 'Send your request');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  finish(Response.json({ success: 'true' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status.textContent, 'Thank you for getting in touch! We’ll get back to you soon.');
  assert.equal(status.querySelector('[role="heading"]').textContent, 'Thank you for getting in touch!');
  assert.equal(form.dataset.state, 'success');
  assert.equal(button.hidden, true);
  assert.equal(form.querySelector('input').value, '');
  assert.equal(form.hasAttribute('aria-busy'), false);
});

test('Finnish pages retain Finnish feedback and regional English uses English feedback', () => {
  const fi = { documentElement: { lang: 'fi' } }, en = { documentElement: { lang: 'en-GB' } };
  assert.equal(publicCopy(fi).sending, 'Lähetetään…');
  assert.equal(publicCopy(en).sending, 'Sending…');
  assert.equal(publicCopy(fi).privacyTitle, 'Yhteydenottolomakkeen tietojen käsittely');
  assert.equal(publicCopy(en).privacyTitle, 'How we use your contact details');
  assert.equal(`${publicCopy(fi).successTitle} ${publicCopy(fi).success}`, 'Kiitos yhteydenotosta! Palaamme sinulle pian.');
});
