// A WebSocket-compatible adapter for networks that only allow ordinary HTTPS.
// It carries the existing Yjs wire protocol; documents and undo stay in place.
export class HttpSocket {
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
  constructor({ server, path = '/api/', token, request = fetch }) {
    this.server = server; this.path = path; this.token = token; this.request = (...args) => request(...args);
    this.readyState = 0; this.binaryType = 'arraybuffer'; this.pending = []; this.sending = false;
    this.controller = new AbortController(); this.id = null;
    this.open().catch(error => this.fail(error));
  }
  async call(action, body = {}) {
    const controller = new AbortController(), abort = () => controller.abort();
    if (this.controller.signal.aborted) abort();
    this.controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25000);
    try {
      const response = await this.request(this.server + this.path + 'poll-' + action, {
        method: 'POST', headers: { authorization: `Bearer ${this.token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: this.id, ...body }), cache: 'no-store', signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) { const error = new Error(result.error || 'Studio-yhteys ei vastaa.'); error.status = response.status; throw error; }
      return result;
    } finally { clearTimeout(timer); this.controller.signal.removeEventListener('abort', abort); }
  }
  deliver(result) {
    for (const value of result.messages || []) {
      if (this.readyState !== 1) break;
      const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
      this.onmessage?.({ data: bytes.buffer });
    }
    if (result.closed) this.close(result.code || 1006);
  }
  async open() {
    const result = await this.call('open');
    if (this.readyState !== 0) return;
    this.id = result.id; this.readyState = 1; this.onopen?.({}); this.deliver(result);
    while (this.readyState === 1) this.deliver(await this.call('read'));
  }
  send(value) {
    if (this.readyState !== 1) throw new Error('HTTPS connection is not open');
    const bytes = new Uint8Array(value);
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    this.pending.push(btoa(binary));
    if (!this.sending) { this.sending = true; queueMicrotask(() => this.flush().catch(error => this.fail(error))); }
  }
  async flush() {
    try {
      while (this.pending.length && this.readyState === 1) {
        const messages = []; let bytes = 0;
        while (this.pending.length && messages.length < 32) {
          const next = this.pending[0];
          if (messages.length && bytes + next.length > 680000) break;
          messages.push(this.pending.shift()); bytes += next.length;
        }
        await this.call('send', { messages });
      }
    } finally { this.sending = false; }
  }
  fail(error) {
    if (this.readyState === 3) return;
    this.onerror?.({ error }); this.close(1006);
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3; this.controller.abort();
    this.pending = [];
    if (this.id) this.request(this.server + this.path + 'poll-close', { method: 'POST',
      headers: { authorization: `Bearer ${this.token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: this.id }), keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {});
    this.onclose?.({ code, reason: 'HTTPS connection closed' });
  }
}
