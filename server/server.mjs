import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, copyFile, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = join(root, 'data');
const homesDir = join(dataDir, 'homes');
const backupsDir = join(dataDir, 'backups');
const cacheDir = join(dataDir, 'cache');
const secretsDir = join(dataDir, 'secrets');
const uploadsDir = join(dataDir, 'uploads');
const distDir = join(root, 'angular-dashboard', 'dist', 'angular-dashboard', 'browser');
const port = Number(process.env.PORT || 3000);
const defaultAdminPin = process.env.ADMIN_PIN || '2580';
const scrypt = promisify(scryptCallback);
const sessions = new Map();
const iconSource = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';
const fallbackIcons = ['home','apartment','cottage','door_front','meeting_room','weekend','chair','bed','bedroom_parent','kitchen','countertops','dining','table_restaurant','bathroom','shower','bathtub','stairs_2','garage_home','deck','yard','lightbulb','floor_lamp','fluorescent','mode_fan','thermostat','heat_pump','ac_unit','water_heater','humidity_percentage','lock','lock_open','door_sensor','shield','security','sensors','motion_sensor_active','videocam','tv','speaker','router','wifi','electrical_services','power','outlet','blinds','curtains','vacuum','cleaning_services','local_laundry_service','dishwasher','oven','microwave','coffee_maker','scene','palette','settings','toggle_on'];

await Promise.all([homesDir, backupsDir, cacheDir, secretsDir, uploadsDir].map((dir) => mkdir(dir, { recursive: true })));

async function adminSecret() {
  try { return JSON.parse(await readFile(join(secretsDir, 'admin.json'), 'utf8')); } catch { return null; }
}

async function verifyAdminPin(pin) {
  const secret = await adminSecret();
  if (!secret) {
    const supplied = Buffer.from(String(pin || ''));
    const expected = Buffer.from(defaultAdminPin);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  const derived = await scrypt(String(pin || ''), secret.salt, 64);
  const expected = Buffer.from(secret.hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

async function saveAdminPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(pin, salt, 64);
  const target = join(secretsDir, 'admin.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ salt, hash: hash.toString('hex'), updatedAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(temporary, target);
}

async function hassSecret() {
  try { return JSON.parse(await readFile(join(secretsDir, 'home-assistant.json'), 'utf8')); } catch {
    return process.env.HASS_URL && process.env.HASS_TOKEN ? { url: process.env.HASS_URL, token: process.env.HASS_TOKEN } : null;
  }
}

async function saveHassSecret(url, token) {
  const target = join(secretsDir, 'home-assistant.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ url: url.replace(/\/$/, ''), token, updatedAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(temporary, target);
}

async function testHomeAssistant(config = null) {
  const secret = config || await hassSecret();
  if (!secret) return { configured: false, connected: false };
  try {
    const response = await fetch(`${secret.url.replace(/\/$/, '')}/api/`, { headers: { authorization: `Bearer ${secret.token}` }, signal: AbortSignal.timeout(5000) });
    return { configured: true, connected: response.ok, url: secret.url };
  } catch { return { configured: true, connected: false, url: secret.url }; }
}

function json(res, status, value, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(value));
}

async function body(req, maxBytes = 1_000_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > maxBytes) throw new Error('Payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function allowCors(req, res) {
  const origin = req.headers.origin;
  if (origin === 'http://localhost:4200' || origin === 'http://127.0.0.1:4200') {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'content-type,x-admin-session');
    res.setHeader('access-control-allow-methods', 'GET,PUT,POST,OPTIONS');
  }
}

function authorized(req) {
  const token = req.headers['x-admin-session'];
  const expiry = typeof token === 'string' ? sessions.get(token) : undefined;
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + 15 * 60_000);
  return true;
}

function validHome(value) {
  return value && typeof value === 'object' && Array.isArray(value.rooms) && value.rooms.every((room) =>
    room && typeof room.id === 'string' && typeof room.name === 'string' && typeof room.floor === 'string' && /^[a-z0-9-]+$/.test(room.floor)
  );
}

async function listBackups(homeId = 'main') {
  const files = await readdir(backupsDir);
  const matching = files.filter((file) => file.startsWith(`${homeId}-`) && file.endsWith('.json'));
  const rows = await Promise.all(matching.map(async (file) => {
    const info = await stat(join(backupsDir, file));
    return { id: file, createdAt: info.mtime.toISOString(), size: info.size };
  }));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

async function readHome(id = 'main') {
  const safeId = id.replace(/[^a-z0-9-]/g, '');
  return JSON.parse(await readFile(join(homesDir, `${safeId}.json`), 'utf8'));
}

async function saveHome(id, value) {
  const safeId = id.replace(/[^a-z0-9-]/g, '');
  const target = join(homesDir, `${safeId}.json`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try { await copyFile(target, join(backupsDir, `${safeId}-${timestamp}.json`)); } catch {}
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

async function iconCatalog() {
  const cacheFile = join(cacheDir, 'material-symbols.json');
  try {
    const info = await stat(cacheFile);
    if (Date.now() - info.mtimeMs < 24 * 60 * 60_000) return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch {}
  try {
    const response = await fetch(iconSource, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Google catalog: ${response.status}`);
    const icons = (await response.text()).split('\n').map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
    const result = { icons: [...new Set(icons)].sort(), source: 'google', updatedAt: new Date().toISOString() };
    await writeFile(cacheFile, JSON.stringify(result));
    return result;
  } catch {
    try { return JSON.parse(await readFile(cacheFile, 'utf8')); } catch {
      return { icons: fallbackIcons, source: 'fallback', updatedAt: null };
    }
  }
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/home-assistant/status') return json(res, 200, await testHomeAssistant());
  if (req.method === 'PUT' && url.pathname === '/api/home-assistant/config') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    const value = await body(req);
    const urlValue = String(value.url || '').replace(/\/$/, '');
    const token = String(value.token || '');
    if (!/^https?:\/\//.test(urlValue) || token.length < 20) return json(res, 400, { error: 'Adresse ou jeton invalide' });
    const status = await testHomeAssistant({ url: urlValue, token });
    if (!status.connected) return json(res, 400, { error: 'Connexion Home Assistant refusée' });
    await saveHassSecret(urlValue, token);
    return json(res, 200, status);
  }
  if (req.method === 'GET' && url.pathname === '/api/system/health') {
    let homeReadable = false;
    try { await readHome('main'); homeReadable = true; } catch {}
    return json(res, 200, { status: homeReadable ? 'ok' : 'degraded', uptime: Math.round(process.uptime()), node: process.version, homeReadable, sessions: sessions.size, now: new Date().toISOString() });
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/unlock') {
    const value = await body(req);
    if (!await verifyAdminPin(value.pin)) return json(res, 401, { error: 'NIP incorrect' });
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + 15 * 60_000);
    return json(res, 200, { token, expiresIn: 900 });
  }
  if (req.method === 'PUT' && url.pathname === '/api/admin/pin') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    const value = await body(req);
    const pin = String(value.pin || '');
    if (!/^\d{4,8}$/.test(pin)) return json(res, 400, { error: 'Le NIP doit contenir de 4 à 8 chiffres' });
    await saveAdminPin(pin);
    return json(res, 200, { saved: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/icons') return json(res, 200, await iconCatalog());
  if (req.method === 'GET' && url.pathname === '/api/backups') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    return json(res, 200, { backups: await listBackups('main') });
  }
  const restoreMatch = url.pathname.match(/^\/api\/backups\/([a-zA-Z0-9_.-]+)\/restore$/);
  if (restoreMatch && req.method === 'POST') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    const backupId = restoreMatch[1];
    if (!backupId.startsWith('main-') || !backupId.endsWith('.json')) return json(res, 400, { error: 'Sauvegarde invalide' });
    const restored = JSON.parse(await readFile(join(backupsDir, backupId), 'utf8'));
    if (!validHome(restored)) return json(res, 400, { error: 'Sauvegarde corrompue' });
    await saveHome('main', restored);
    return json(res, 200, { restored: true });
  }
  const backgroundMatch = url.pathname.match(/^\/api\/homes\/([a-z0-9-]+)\/rooms\/([a-z0-9-]+)\/background$/);
  if (backgroundMatch && req.method === 'POST') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    const value = await body(req, 16_000_000);
    const match = String(value.dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json(res, 400, { error: 'Image JPEG, PNG ou WebP requise' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 10_000_000) return json(res, 400, { error: 'L’image doit faire moins de 10 Mo' });
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
    const homeId = backgroundMatch[1];
    const roomId = backgroundMatch[2];
    const targetDir = join(uploadsDir, 'homes', homeId);
    await mkdir(targetDir, { recursive: true });
    const filename = `${roomId}-${Date.now()}.${extension}`;
    await writeFile(join(targetDir, filename), buffer, { mode: 0o644 });
    return json(res, 200, { url: `/uploads/homes/${homeId}/${filename}` });
  }
  const homeMatch = url.pathname.match(/^\/api\/homes\/([a-z0-9-]+)$/);
  if (homeMatch && req.method === 'GET') {
    try { return json(res, 200, await readHome(homeMatch[1])); } catch { return json(res, 404, { error: 'Maison introuvable' }); }
  }
  if (homeMatch && req.method === 'PUT') {
    if (!authorized(req)) return json(res, 401, { error: 'Session administrateur expirée' });
    const value = await body(req);
    if (!validHome(value)) return json(res, 400, { error: 'Configuration invalide' });
    await saveHome(homeMatch[1], value);
    return json(res, 200, { saved: true });
  }
  return json(res, 404, { error: 'Route introuvable' });
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  allowCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) {
      const requestedUpload = normalize(url.pathname.replace(/^\/uploads\/+/, ''));
      if (requestedUpload.startsWith('..')) return json(res, 403, { error: 'Accès refusé' });
      const file = join(uploadsDir, requestedUpload);
      try { await stat(file); } catch { return json(res, 404, { error: 'Image introuvable' }); }
      res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' });
      return createReadStream(file).pipe(res);
    }
    const requested = normalize(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
    if (requested.startsWith('..')) return json(res, 403, { error: 'Accès refusé' });
    let file = join(distDir, requested);
    try { await stat(file); } catch { file = join(distDir, 'index.html'); }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (error) {
    json(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof Error ? error.message : 'Erreur serveur' });
  }
});

server.listen(port, () => console.log(`Dashboard server: http://localhost:${port}`));

const websocketServer = new WebSocketServer({ noServer: true });
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/api/home-assistant/websocket') return socket.destroy();
  const secret = await hassSecret();
  if (!secret) return socket.destroy();
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    const upstreamUrl = secret.url.replace(/^http/, 'ws') + '/api/websocket';
    const upstream = new WebSocket(upstreamUrl);
    let authenticated = false;
    upstream.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'auth_required') { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message)); return; }
        if (message.type === 'auth_ok') authenticated = true;
      } catch {}
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });
    client.on('message', (data) => {
      try { const message = JSON.parse(data.toString()); if (message.type === 'auth' && !authenticated) { upstream.send(JSON.stringify({ type: 'auth', access_token: secret.token })); return; } } catch {}
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data.toString());
    });
    const close = () => { if (client.readyState < WebSocket.CLOSING) client.close(); if (upstream.readyState < WebSocket.CLOSING) upstream.close(); };
    client.on('close', close); upstream.on('close', close); upstream.on('error', close);
  });
});
