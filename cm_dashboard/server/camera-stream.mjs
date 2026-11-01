import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Keep credentials on the server and stop the upstream connection when the viewer closes.
export async function proxyCameraStream(req, res, { url, token, entityId }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once('close', abort);
  const headerTimeout = setTimeout(abort, 15000);
  headerTimeout.unref();
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/camera_proxy_stream/${encodeURIComponent(entityId)}`, {
      headers: { authorization: `Bearer ${token}` }, signal: controller.signal
    });
    clearTimeout(headerTimeout);
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      res.writeHead(response.ok ? 502 : response.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'Flux caméra indisponible' }));
      return;
    }
    res.writeHead(200, {
      'content-type': response.headers.get('content-type') || 'multipart/x-mixed-replace',
      'cache-control': 'no-store, max-age=0', 'x-accel-buffering': 'no'
    });
    res.flushHeaders();
    await pipeline(Readable.fromWeb(response.body), res);
  } catch {
    if (res.destroyed) return;
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'Flux caméra indisponible' }));
    }
  } finally {
    clearTimeout(headerTimeout);
    res.off('close', abort);
    controller.abort();
  }
}
