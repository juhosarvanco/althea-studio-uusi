export function quickTunnelAddress(log) {
  // Only the successful creation banner contains the assigned address in a box.
  // Error messages can contain https://api.trycloudflare.com/tunnel instead.
  return log.match(/\|[ \t]+(https:\/\/(?!api\.)(?:[a-z0-9]+-)*[a-z0-9]+\.trycloudflare\.com)[ \t]+\|/)?.[1] || null;
}

export function tunnelFailureMessage(log) {
  if (/lookup api\.trycloudflare\.com\b/.test(log)) {
    return 'Verkon nimipalvelu (DNS) ei löydä Cloudflaren etäyhteyspalvelua. Vaihda internetyhteyttä tai tarkista Macin DNS-asetukset ja kokeile uudelleen.';
  }
  return 'Studion etäyhteys ei käynnistynyt. Tarkista internetyhteys. Lisätiedot: .studio-live/tunnel.log.';
}
