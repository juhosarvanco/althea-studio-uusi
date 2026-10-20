import { studioAddress } from '../shared/studio-address.mjs';
export const SITE_BASE = '/althea-studio-uusi/';

export function connectionMessage(error) {
  return ['TypeError', 'TimeoutError', 'AbortError'].includes(error?.name)
    ? 'Yhteys Studion tallennuspalvelimeen ei onnistu. Jos Mac oli sammunut tai nukkumassa, käynnistä uusi Studio Macilla ja päivitä tämä sivu hetken kuluttua.'
    : error.message;
}

export function sitePath(path = '') {
  return `${location.hostname === 'juhosarvanco.github.io' ? SITE_BASE : '/'}${path}`;
}

export function studioLanguage() {
  return /\/(?:en)\/studio(?:\/|$)/.test(location.pathname || '') ? 'en' : 'fi';
}

export function contentPath(path, language = studioLanguage()) {
  if (!['fi', 'en'].includes(language) || !path.startsWith('/api/')) throw new Error('Invalid Studio content path');
  return language === 'en' ? path.replace('/api/', '/api/en/') : path;
}

export const studioRoom = (language = studioLanguage()) => language === 'en' ? 'althea-uusi-en' : 'althea-uusi';

let configuration;
export async function studioConfiguration({ refresh = false } = {}) {
  if (!configuration || refresh) {
    const response = await fetch(sitePath('studio/config.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('Studion yhteysasetuksia ei voitu avata.');
    const data = await response.json();
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    configuration = { server: studioAddress(local ? location.origin : data.server, { local }) };
    if (!local && data.relay) configuration.relay = studioAddress(data.relay);
  }
  return configuration;
}
