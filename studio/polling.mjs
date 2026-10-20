import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };

// The HTTPS transport uses the same protocol handlers, validation, persistence
// acknowledgements and presence ownership rules as native WebSocket clients.
class PollSocket extends EventEmitter {
  constructor(user, context) {
    super(); this.user = user; this.context = context; this.readyState = 1;
    this.queue = []; this.bytes = 0; this.lastSeen = Date.now(); this.waiter = null;
    this.code = 1000;
  }
  send(value) {
    if (this.readyState !== 1) return;
    const bytes = Buffer.from(value);
    if (this.bytes + bytes.length > 3 * 1024 * 1024) return this.close(4009);
    this.queue.push(bytes.toString('base64')); this.bytes += bytes.length; this.waiter?.();
  }
  async read() {
    if (this.waiter) fail('Another poll is already active.', 409);
    if (!this.queue.length && this.readyState === 1) await new Promise(resolve => {
      const done = () => { clearTimeout(timer); this.waiter = null; resolve(); };
      const timer = setTimeout(done, 15000); this.waiter = done;
    });
    const messages = this.queue; this.queue = []; this.bytes = 0;
    return { messages, closed: this.readyState !== 1, code: this.code };
  }
  ping() { if (Date.now() - this.lastSeen < 45000) this.emit('pong'); else this.terminate(); }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.code = code; this.readyState = 3; this.waiter?.(); this.emit('close');
  }
  terminate() { this.close(1006); }
}

export class PollConnections {
  constructor() {
    this.sockets = new Map();
    this.timer = setInterval(() => {
      for (const [id, socket] of this.sockets) if (Date.now() - socket.lastSeen > 45000) {
        socket.terminate(); this.sockets.delete(id);
      }
    }, 15000); this.timer.unref();
  }
  async handle(path, body, user, context, connect) {
    if (path === '/api/poll-open') {
      const own = [...this.sockets.values()].filter(s => s.user.sub === user.sub && s.readyState === 1);
      if (this.sockets.size >= 100 || own.length >= 12) fail('Liian monta avointa Studio-yhteyttä.', 429);
      const id = randomBytes(32).toString('base64url'), socket = new PollSocket(user, context);
      this.sockets.set(id, socket); connect(socket, user, context);
      return { id, ...await socket.read() };
    }
    const socket = this.sockets.get(body.id);
    if (!socket || socket.user.sub !== user.sub || socket.user.sid !== user.sid || socket.context !== context)
      fail('Yhteys pitää avata uudelleen.', 410);
    socket.lastSeen = Date.now();
    if (path === '/api/poll-close') { socket.close(); this.sockets.delete(body.id); return { ok: true }; }
    if (path === '/api/poll-read') {
      const result = await socket.read();
      if (!result.messages.length && !result.closed) result.messages.push(Buffer.from(context.ack()).toString('base64'));
      return result;
    }
    if (path === '/api/poll-send') {
      if (socket.readyState !== 1) fail('Yhteys pitää avata uudelleen.', 410);
      if (!Array.isArray(body.messages) || body.messages.length > 64) fail('Invalid messages');
      let total = 0;
      const messages = body.messages.map(value => {
        if (typeof value !== 'string' || value.length > 700000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Invalid message');
        const bytes = Buffer.from(value, 'base64'); total += bytes.length;
        if (total > 512 * 1024 || bytes.toString('base64') !== value) fail('Invalid message size');
        return bytes;
      });
      for (const bytes of messages) if (socket.readyState === 1) socket.emit('message', bytes);
      return { ok: true };
    }
    fail('Unknown transport route', 404);
  }
  close() { clearInterval(this.timer); for (const socket of this.sockets.values()) socket.terminate(); this.sockets.clear(); }
}
