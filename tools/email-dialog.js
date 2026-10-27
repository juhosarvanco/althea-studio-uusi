const started = new WeakSet();

// Delegation keeps the popup working when Studio replaces the live layout.
export function startEmailDialog(document) {
  if (started.has(document)) return;
  started.add(document);
  let trigger;
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open-contact-email]');
    const dialog = document.querySelector('#contact-email-dialog');
    if (!dialog) return;
    if (opener && typeof dialog.showModal === 'function') {
      event.preventDefault(); trigger = opener;
      if (!dialog.open) dialog.showModal();
      document.documentElement.classList.add('contact-email-open');
    } else if (event.target.closest('[data-close-contact-email]')) {
      dialog.close();
    } else if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    }
  }, true);
  document.addEventListener('close', event => {
    if (event.target.id !== 'contact-email-dialog') return;
    document.documentElement.classList.remove('contact-email-open');
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, true);
}
