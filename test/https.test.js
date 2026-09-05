import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireHttps } from '../middleware/requireHttps.js';

const base = 'https://performa.example/backend';
function invoke(originalUrl, secure = false) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    redirect(status, location) { this.status = status; this.location = location; } };
  let passed = false;
  requireHttps(base)({ originalUrl, secure }, res, () => { passed = true; });
  return { ...res, passed };
}
test('HTTPS redirect retains API prefix and query parameters', () => {
  const result = invoke('/api/auth/airnav/start?next=a%2Fb');
  assert.equal(result.location, `${base}/api/auth/airnav/start?next=a%2Fb`);
  assert.equal(result.status, 307);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('already prefixed requests do not duplicate backend', () => {
  assert.equal(invoke('/backend/api/auth/session').location, `${base}/api/auth/session`);
});
test('prefix matching respects path boundaries', () => {
  assert.equal(invoke('/backend-other').location, `${base}/backend-other`);
});
test('secure requests proceed without redirect', () => {
  assert.equal(invoke('/api/auth/airnav/start', true).passed, true);
});
test('request cannot override canonical redirect host', () => {
  assert.equal(new URL(invoke('//evil.example/path').location).origin, 'https://performa.example');
});
test('invalid public base configuration fails closed', () => {
  for (const value of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?q=1']) {
    assert.throws(() => requireHttps(value));
  }
});
test('forwarded HTTPS accepted only through configured proxy trust', async () => {
  for (const trust of [false, 'loopback']) {
    const app = express();
    app.set('trust proxy', trust);
    app.use(requireHttps(base));
    app.use((_req, res) => res.sendStatus(204));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/airnav/start`, {
        headers: { 'X-Forwarded-Proto': 'https' }, redirect: 'manual',
      });
      assert.equal(response.status, trust ? 204 : 307);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});
