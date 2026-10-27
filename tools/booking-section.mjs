import { parseHTML } from 'linkedom';
import { bookingLinks } from './booking.js';

const copy = {
  fi: {
    kicker: 'Maksuton tutustumiskeskustelu', heading: 'Milloin sinulle sopisi?',
    hours: 'Ma–pe klo 10–16 · Suomen aika · 30 minuuttia',
    loading: 'Haetaan vapaita aikoja Althea-kalenterista…',
    fallback: 'Voit myös avata ajanvarauksen erillisessä välilehdessä ↗',
    footnote: 'Soitamme antamaasi puhelinnumeroon. Keskustelu on maksuton eikä sido osallistumaan.',
    privacy: 'Tietojen käsittely', placeholder: 'Ajanvarauskalenteri näkyy julkisella sivustolla. Voit muokata tämän osion tekstejä Studiossa.',
    chatTitle: 'Haluatko kysyä ensin?', chatCopy: 'Voit aloittaa myös viestillä. Julia tai Juho vastaa sinulle.',
    chatLink: 'Kirjoita WhatsAppissa ↗', chatMessage: 'Hei! Haluaisin kuulla lisää Althean ohjelmasta.',
    email: 'Otatko mieluummin yhteyttä sähköpostilla?',
  },
  en: {
    kicker: 'Free introductory call', heading: 'When would suit you?',
    hours: 'Mon–Fri, 10:00–16:00 · Finnish time · 30 minutes',
    loading: 'Finding available times in the Althea calendar…',
    fallback: 'You can also open the booking calendar in a new tab ↗',
    footnote: 'We will call the phone number you provide. The call is free, with no obligation to join.',
    privacy: 'How we use your details', placeholder: 'The booking calendar appears on the public website. You can edit the text in this section in Studio.',
    chatTitle: 'Would you like to ask us something first?', chatCopy: 'You can also start with a message. Julia or Juho will reply.',
    chatLink: 'Message us on WhatsApp ↗', chatMessage: 'Hi! I would like to learn more about the Althea programme.',
    email: 'Prefer to get in touch by email?',
  },
};

// Used with the local layout API, preserving shared field IDs, comments and forms.
export function addBookingSection(html, styles) {
  const { document } = parseHTML(html);
  if (document.querySelector('[data-booking-calendar]')) return html;
  const language = document.documentElement.lang.startsWith('en') ? 'en' : 'fi', c = copy[language];
  const contact = document.querySelector('#yhteys .contact');
  if (!contact) throw new Error('Missing contact section');
  const intro = contact.firstElementChild, emailPanel = contact.querySelector('.contact-panel');
  if (!emailPanel?.querySelector('#contact-form')) throw new Error('Missing email form');
  contact.classList.add('booking-contact'); intro.classList.add('booking-intro');
  const card = document.createElement('div'); card.className = 'booking-card'; card.id = 'ajanvaraus';
  card.innerHTML = `<div class="booking-card-heading"><p class="booking-kicker">${c.kicker}</p><h3>${c.heading}</h3><p class="booking-hours">${c.hours}</p></div>
    <div data-studio-ignore><div id="althea-booking-calendar" data-booking-calendar class="booking-calendar"><p class="studio-booking-placeholder">${c.placeholder}</p></div><p class="booking-status" data-booking-status role="status">${c.loading}</p><p class="booking-fallback"><a href="https://cal.com/${bookingLinks[language]}" target="_blank" rel="noopener noreferrer">${c.fallback}</a></p></div>
    <div class="booking-footnote"><p>${c.footnote}</p><button class="inline-button" type="button" data-policy="privacy" data-studio-ignore>${c.privacy}</button></div>`;
  const chat = document.createElement('div'); chat.className = 'whatsapp-card';
  chat.innerHTML = `<span class="whatsapp-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20.4 15.5A9 9 0 0 0 6.5 4.6a9 9 0 0 0-2 10.8L3 21l5.6-1.5a9 9 0 0 0 11.8-4Z"/><path d="m8.1 7.4 2 2-1.2 1.4c.8 1.6 2 2.8 3.8 3.5l1.2-1.3 2.2 1.8c.2 1.2-.8 2.1-2 2.1-3.7-.5-7.5-4.1-8-7.6 0-1.1 1-2.1 2-1.9Z"/></svg></span><div><h3>${c.chatTitle}</h3><p>${c.chatCopy}</p><a class="whatsapp-link" href="https://wa.me/358407471234?text=${encodeURIComponent(c.chatMessage)}" target="_blank" rel="noopener noreferrer">${c.chatLink}</a></div>`;
  const email = document.createElement('details'); email.className = 'contact-email-option';
  email.innerHTML = `<summary><span>${c.email}</span></summary><p class="email-direct" data-studio-ignore><a href="mailto:info@althea.fi">info@althea.fi</a></p>`;
  email.append(emailPanel);
  // Keep the reply-time sentence with email, where it remains accurate.
  const reply = intro.querySelector('.contact-list li:last-child');
  if (reply) { const list = document.createElement('ul'); list.className = 'contact-list'; list.append(reply); email.append(list); }
  intro.append(chat, email); contact.append(card);
  const style = document.createElement('style'); style.id = 'althea-booking-styles'; style.textContent = styles; document.head.append(style);
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}

// Apply the contact-section review without replacing any form fields or history.
export function refineBookingContact(html, styles) {
  const { document } = parseHTML(html);
  const en = document.documentElement.lang.startsWith('en');
  const contact = document.querySelector('#yhteys .booking-contact');
  if (!contact) throw new Error('Missing booking contact section');
  document.querySelector('.booking-fallback')?.setAttribute('hidden', '');
  document.querySelector('.booking-footnote')?.setAttribute('hidden', '');
  const chat = contact.querySelector('.whatsapp-card');
  chat.querySelector('p')?.remove();
  if (!document.querySelector('#contact-email-dialog')) {
    const old = contact.querySelector('.contact-email-option');
    const panel = old?.querySelector('.contact-panel');
    if (!panel) throw new Error('Missing email form');
    const dialog = document.createElement('dialog');
    dialog.id = 'contact-email-dialog'; dialog.className = 'contact-email-dialog';
    dialog.setAttribute('aria-labelledby', 'contact-email-title');
    const heading = panel.querySelector('h3'); heading.id = 'contact-email-title';
    const close = document.createElement('button'); close.type = 'button';
    close.className = 'contact-email-close'; close.setAttribute('data-close-contact-email', '');
    close.setAttribute('data-studio-ignore', '');
    close.setAttribute('aria-label', en ? 'Close email form' : 'Sulje sähköpostilomake'); close.textContent = '×';
    dialog.append(close, panel);
    const reply = old.querySelector('.contact-list'); if (reply) dialog.append(reply);
    old.remove(); contact.append(dialog);
    const links = document.createElement('div'); links.className = 'contact-channel-links';
    const whatsapp = chat.querySelector('.whatsapp-link');
    const email = document.createElement('a'); email.className = 'contact-email-link';
    email.href = 'mailto:info@althea.fi'; email.setAttribute('data-open-contact-email', '');
    email.setAttribute('aria-haspopup', 'dialog'); email.setAttribute('aria-controls', dialog.id);
    email.textContent = en ? 'Send an email' : 'Kirjoita sähköposti';
    whatsapp.parentElement.append(links); links.append(whatsapp, email);
  }
  document.querySelector('#althea-booking-styles').textContent = styles;
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}
