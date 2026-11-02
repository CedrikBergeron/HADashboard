import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const localPrefix = '/api/home-assistant/hls/';
const upstreamPrefix = '/api/hls/';

export function rewriteCameraPlaylist(text, upstreamUrl) {
  const base = new URL(upstreamUrl);
  const rewrite = (uri) => {
    const target = new URL(uri, base);
    if (target.origin !== base.origin || !target.pathname.startsWith(upstreamPrefix)) throw new Error('Invalid media path');
    return localPrefix + target.pathname.slice(upstreamPrefix.length) + target.search;
  };
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`);
    return rewrite(line.trim());
  }).join('\n');
}

export async function proxyCameraHls(req, res, requestUrl, { url, token }) {
  const suffix = requestUrl.pathname.slice(localPrefix.length);
  if (!/^[a-zA-Z0-9_./-]+$/.test(suffix) || suffix.split('/').some((part) => part === '..' || part === '.')) {
    res.writeHead(400); res.end(); return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once('close', abort);
  const timeout = setTimeout(abort, 30000);
  timeout.unref();
  try {
    const upstreamUrl = `${url.replace(/\/$/, '')}${upstreamPrefix}${suffix}${requestUrl.search}`;
    const headers = { authorization: `Bearer ${token}` };
    if (req.headers.range) headers.range = req.headers.range;
    const response = await fetch(upstreamUrl, { method: req.method, headers, signal: controller.signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); res.writeHead(response.status, { 'cache-control': 'no-store' }); res.end(); return; }
    const outgoing = { 'content-type': response.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' };
    if (req.method === 'HEAD') { res.writeHead(response.status, outgoing); res.end(); return; }
    if (requestUrl.pathname.endsWith('.m3u8')) {
      const playlist = rewriteCameraPlaylist(await response.text(), upstreamUrl);
      outgoing['content-type'] = 'application/vnd.apple.mpegurl';
      res.writeHead(200, outgoing); res.end(playlist); return;
    }
    for (const header of ['content-range', 'accept-ranges', 'content-length']) { const value = response.headers.get(header); if (value) outgoing[header] = value; }
    if (!response.body) throw new Error('Empty camera response');
    res.writeHead(response.status, outgoing);
    await pipeline(Readable.fromWeb(response.body), res);
  } catch {
    if (res.destroyed) return;
    if (res.headersSent) res.destroy();
    else { res.writeHead(502, { 'cache-control': 'no-store' }); res.end('Video stream unavailable'); }
  } finally { clearTimeout(timeout); res.off('close', abort); controller.abort(); }
}
