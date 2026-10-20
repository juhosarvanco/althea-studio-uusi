export function studioAddress(value, { local = false } = {}) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  const privateHost = loopback || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')
    || !url.hostname.includes('.') || url.hostname.includes(':')
    || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (local ? !loopback || !['http:', 'https:'].includes(url.protocol) : privateHost || url.protocol !== 'https:'))
    throw new Error('Studion etäosoitteen pitää olla julkinen HTTPS-osoite, jotta yhteys toimii eri verkoista.');
  return url.origin;
}
