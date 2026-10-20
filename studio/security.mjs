import { studioAddress } from '../shared/studio-address.mjs';

export function studioPolicy(server, relay) {
  const local = ['127.0.0.1', 'localhost'].includes(new URL(server).hostname);
  const primary = studioAddress(server, { local });
  const connections = ["'self'", primary, primary.replace(/^http/, 'ws')];
  if (relay) connections.push(studioAddress(relay));
  if (local) connections.push('http://127.0.0.1:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'ws://localhost:*');
  return ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    `connect-src ${connections.join(' ')}`, `img-src 'self' blob: data: ${[primary, relay].filter(Boolean).join(' ')}`,
    "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"].join('; ');
}

// GitHub Pages cannot set frame-ancestors headers. Refuse to initialise any
// credential handling or editor controls when another page embeds Studio.
export function requireTopLevel(window, document) {
  if (window.self === window.top) return;
  const message = document.createElement('p'), link = document.createElement('a');
  message.textContent = 'Avaa Althea Studio omassa välilehdessään.';
  link.textContent = 'Avaa Studio'; link.href = window.location.href;
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  document.body.replaceChildren(message, link);
  throw new Error('Studio cannot run inside a frame.');
}
