// Choose the backup only for connectivity/server failures, never to get around
// an account denial. The saved login belongs to the same server on both routes.
export async function connectionRequest(configuration, path, options = {}, request = fetch) {
  const candidates = [{ server: configuration.server, transport: configuration.transport === 'https' ? 'https' : 'websocket' }];
  if (configuration.relay) {
    const relay = { server: configuration.relay, transport: 'https' };
    configuration.preferRelay ? candidates.unshift(relay) : candidates.push(relay);
  }
  let failure;
  for (const [index, candidate] of candidates.entries()) {
    try {
      const response = await request(candidate.server + path, { ...options,
        signal: AbortSignal.timeout(index === 0 && candidates.length > 1 ? 6000 : 20000) });
      const result = await response.json();
      if (response.status >= 500) { const error = new Error(result.error || 'Tallennuspalvelin ei vastaa.'); error.status = response.status; throw error; }
      return { response, result, ...candidate, ...(configuration.relay ? { relay: configuration.relay } : {}) };
    } catch (error) { failure = error; }
  }
  throw failure;
}
