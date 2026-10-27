// Public booking links contain no account credentials. Studio never loads this module.
export const bookingLinks = Object.freeze({
  fi: 'team-althea-zulfrv/tutustumiskeskustelu',
  en: 'team-althea-zulfrv/introductory-call',
});

export function startBooking(document, window = document.defaultView) {
  const container = document.querySelector('[data-booking-calendar]');
  if (!container || document.documentElement.hasAttribute('data-studio-language')) return;
  const language = document.documentElement.lang?.startsWith('en') ? 'en' : 'fi';
  const status = document.querySelector('[data-booking-status]');
  const fail = () => { if (status) { status.hidden = false; status.textContent = language === 'en'
    ? 'Please use the booking link below if the calendar does not load.'
    : 'Jos kalenteri ei lataudu, käytä alla olevaa varauslinkkiä.'; } };
  // Cal.com's official queue loader. Disable forwarding of visitor URL parameters.
  if (!window.Cal) {
    window.Cal = function () {
      const cal = window.Cal, args = arguments;
      if (!cal.loaded) {
        cal.ns = {}; cal.q = [];
        const script = document.createElement('script');
        script.src = 'https://app.cal.com/embed/embed.js'; script.onerror = fail;
        document.head.append(script); cal.loaded = true;
      }
      if (args[0] === 'init') {
        const namespace = args[1], api = function () { api.q.push(arguments); };
        api.q = []; cal.ns[namespace] = cal.ns[namespace] || api;
        cal.ns[namespace].q.push(args); cal.q.push(['initNamespace', namespace]); return;
      }
      cal.q.push(args);
    };
  }
  const Cal = window.Cal, namespace = `althea-${language}`;
  Cal('init', namespace, { origin: 'https://app.cal.com' });
  Cal.config = Cal.config || {}; Cal.config.forwardQueryParams = false;
  const api = Cal.ns[namespace];
  api('on', { action: 'linkReady', callback: () => { if (status) status.hidden = true; } });
  api('on', { action: 'linkFailed', callback: fail });
  api('inline', { elementOrSelector: '#althea-booking-calendar', calLink: bookingLinks[language],
    config: { layout: 'month_view', useSlotsViewOnSmallScreen: 'true', theme: 'light' } });
  api('ui', { theme: 'light', cssVarsPerTheme: { light: { 'cal-brand': '#0d1f29' } },
    hideEventTypeDetails: true, showTimezoneWhenEventDetailsHidden: true, layout: 'month_view' });
}
