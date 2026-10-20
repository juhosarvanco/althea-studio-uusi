import test from 'node:test';
import assert from 'node:assert/strict';
import { sendContactRequest } from '../../tools/contact-form.js';

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
