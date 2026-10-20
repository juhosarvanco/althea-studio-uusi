export async function sendContactRequest(action, data, request = fetch) {
  const endpoint = new URL(action);
  if (endpoint.origin !== 'https://formsubmit.co') throw new Error('Invalid contact endpoint');
  endpoint.pathname = `/ajax${endpoint.pathname}`;
  const response = await request(endpoint.href, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: data,
    credentials: 'omit',
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || ![true, 'true'].includes(result.success)) throw new Error('Message was not accepted');
}

export function startContactForm(document, request = fetch) {
  const form = document.querySelector('#contact-form');
  if (!form) return;
  const status = document.querySelector('#contact-status');
  const submit = form.querySelector('[type="submit"]');
  const label = submit.textContent;
  let sending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    const data = new FormData(form);
    const controls = [...form.querySelectorAll('input, textarea, button')]
      .map(control => [control, control.disabled]);
    sending = true;
    controls.forEach(([control]) => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    submit.textContent = 'Lähetetään…';
    status.dataset.state = 'pending';
    status.textContent = 'Lähetetään yhteydenottopyyntöä…';
    try {
      await sendContactRequest(form.action, data, request);
      form.reset();
      status.dataset.state = 'success';
      status.textContent = 'Kiitos! Yhteydenottopyyntösi on lähetetty. Vastaamme kahden arkipäivän kuluessa.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Lähetys ei onnistunut. Tietosi ovat tallella lomakkeessa. Yritä uudelleen tai lähetä viesti osoitteeseen info@althea.fi.';
    } finally {
      sending = false;
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      form.removeAttribute('aria-busy');
      submit.textContent = label;
    }
  });
}
