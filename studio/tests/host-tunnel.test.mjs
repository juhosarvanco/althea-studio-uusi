import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickTunnelAddress, tunnelFailureMessage } from '../../tools/studio-tunnel.mjs';

const dnsFailure = 'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host';

test('a failed Cloudflare API request is not a Studio connection address', () => {
  assert.equal(quickTunnelAddress(dnsFailure), null);
  assert.match(tunnelFailureMessage(dnsFailure), /nimipalvelu \(DNS\)/);
  assert.match(tunnelFailureMessage(dnsFailure), /DNS-asetukset/);
});

test('only the assigned address in the successful creation banner is used', () => {
  const log = `${dnsFailure}\n2026-10-19T16:54:55Z INF +------------------------------------------------------------+\n2026-10-19T16:54:55Z INF |  Your quick Tunnel has been created! Visit it at:           |\n2026-10-19T16:54:55Z INF |  https://studio-connection-example.trycloudflare.com        |\n2026-10-19T16:54:55Z INF +------------------------------------------------------------+\n`;
  assert.equal(quickTunnelAddress(log), 'https://studio-connection-example.trycloudflare.com');
  assert.equal(quickTunnelAddress('|  https://api.trycloudflare.com  |'), null);
  assert.equal(quickTunnelAddress('request failed: https://expired.trycloudflare.com'), null);
  assert.equal(quickTunnelAddress(''), null);
});

test('other tunnel failures point to diagnostics without assuming a DNS problem', () => {
  const message = tunnelFailureMessage('failed to request quick Tunnel: connection refused');
  assert.match(message, /tunnel\.log/);
  assert.doesNotMatch(message, /DNS/);
});
