import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { proxyCameraStream } from './camera-stream.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('camera stream forwards multipart chunks immediately and disconnects upstream on close', async (t) => {
  let forwardedAuth;
  let forwardedPath;
  let disconnected;
  const upstreamClosed = new Promise((resolve) => disconnected = resolve);
  const upstream = await serve(t, (req, res) => {
    forwardedAuth = req.headers.authorization;
    forwardedPath = req.url;
    res.once('close', disconnected);
    res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' });
    res.write('--frame\r\nContent-Type: image/jpeg\r\n\r\nfirst-frame\r\n');
  });
  const proxy = await serve(t, (req, res) => { void proxyCameraStream(req, res, { url: upstream, token: 'private-token', entityId: 'camera.front' }); });
  const controller = new AbortController();
  const response = await fetch(proxy, { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'multipart/x-mixed-replace; boundary=frame');
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const first = await response.body.getReader().read();
  assert.match(Buffer.from(first.value).toString(), /first-frame/);
  assert.equal(forwardedAuth, 'Bearer private-token');
  assert.equal(forwardedPath, '/api/camera_proxy_stream/camera.front');
  controller.abort();
  let timer;
  try { await Promise.race([upstreamClosed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Upstream was not disconnected')), 2000); })]); }
  finally { clearTimeout(timer); }
});

test('camera stream reports an upstream error without exposing its response or credentials', async (t) => {
  const upstream = await serve(t, (_, res) => { res.writeHead(503); res.end('private upstream details'); });
  const proxy = await serve(t, (req, res) => { void proxyCameraStream(req, res, { url: upstream, token: 'private-token', entityId: 'camera.front' }); });
  const response = await fetch(proxy);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Flux caméra indisponible' });
});

test('camera stream returns a controlled error if Home Assistant cannot be reached', async (t) => {
  const proxy = await serve(t, (req, res) => { void proxyCameraStream(req, res, { url: 'http://127.0.0.1:1', token: 'private-token', entityId: 'camera.front' }); });
  const response = await fetch(proxy);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Flux caméra indisponible' });
});
