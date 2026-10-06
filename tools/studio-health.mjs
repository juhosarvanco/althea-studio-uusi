export async function studioReachable(address, { request = fetch, timeoutMs = 5000 } = {}) {
  try {
    const url = new URL(address);
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || !(url.protocol === 'https:' || (local && url.protocol === 'http:'))) return false;
    const response = await request(`${url.origin}/health`, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
    });
    return response.ok && (await response.json()).ok === true;
  } catch { return false; }
}

export async function waitForStudio(address, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await studioReachable(address, { timeoutMs: Math.min(5000, deadline - Date.now()) })) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Studion etäyhteys ei vastaa. Tarkista internetyhteys ja käynnistä Studio uudelleen.');
}
