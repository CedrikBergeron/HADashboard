import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { proxyCameraHls, rewriteCameraPlaylist } from './camera-hls.mjs';

async function serve(t, handler) {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('HLS playlists rewrite segments, variants, initialization and LL-HLS URIs through the local proxy', () => {
  const result = rewriteCameraPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-PART:URI="/api/hls/session/part.m4s"\nvariant.m3u8\nsegment.ts\n', 'http://ha.local/api/hls/session/master.m3u8');
  assert.match(result, /URI="\/api\/home-assistant\/hls\/session\/init.mp4"/);
  assert.match(result, /URI="\/api\/home-assistant\/hls\/session\/part.m4s"/);
  assert.match(result, /\/api\/home-assistant\/hls\/session\/variant.m3u8/);
  assert.match(result, /\/api\/home-assistant\/hls\/session\/segment.ts/);
  assert.throws(() => rewriteCameraPlaylist('https://outside.example/segment.ts', 'http://ha.local/api/hls/session/master.m3u8'));
  assert.throws(() => rewriteCameraPlaylist('../../../private', 'http://ha.local/api/hls/session/master.m3u8'));
});

test('HLS proxy keeps authorization server-side and forwards video byte ranges', async (t) => {
  let auth; let range;
  const upstream = await serve(t, (req, res) => {
    auth = req.headers.authorization;
    if (req.url.endsWith('.m3u8')) { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U\ninit.mp4\n'); }
    else { range = req.headers.range; res.writeHead(206, { 'content-type': 'video/mp4', 'content-range': 'bytes 0-2/3', 'content-length': '3' }); res.end('abc'); }
  });
  const proxy = await serve(t, (req, res) => { void proxyCameraHls(req, res, new URL(req.url, 'http://local'), { url: upstream, token: 'private-token' }); });
  const playlist = await fetch(proxy + '/api/home-assistant/hls/session/master.m3u8');
  assert.equal(playlist.status, 200);
  assert.equal(await playlist.text(), '#EXTM3U\n/api/home-assistant/hls/session/init.mp4\n');
  const segment = await fetch(proxy + '/api/home-assistant/hls/session/init.mp4', { headers: { range: 'bytes=0-2' } });
  assert.equal(segment.status, 206); assert.equal(await segment.text(), 'abc');
  assert.equal(segment.headers.get('content-range'), 'bytes 0-2/3');
  assert.equal(auth, 'Bearer private-token'); assert.equal(range, 'bytes=0-2');
});

test('HLS proxy rejects a manifest referencing an external origin', async (t) => {
  const upstream = await serve(t, (_, res) => res.end('#EXTM3U\nhttps://external.example/secret.ts\n'));
  const proxy = await serve(t, (req, res) => { void proxyCameraHls(req, res, new URL(req.url, 'http://local'), { url: upstream, token: 'private-token' }); });
  const response = await fetch(proxy + '/api/home-assistant/hls/session/master.m3u8');
  assert.equal(response.status, 502); assert.equal(await response.text(), 'Video stream unavailable');
});
