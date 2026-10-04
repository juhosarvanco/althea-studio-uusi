export const SITE_BASE = '/althea-studio-uusi/';

export function sitePath(path = '') {
  return `${['localhost', '127.0.0.1'].includes(location.hostname) ? '/' : SITE_BASE}${path}`;
}

let configuration;
export async function studioConfiguration() {
  if (!configuration) {
    const response = await fetch(sitePath('studio/config.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('Studion yhteysasetuksia ei voitu avata.');
    const data = await response.json();
    const url = new URL(['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : data.server);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Studion yhteysosoite ei ole kelvollinen.');
    configuration = { server: url.origin };
  }
  return configuration;
}
