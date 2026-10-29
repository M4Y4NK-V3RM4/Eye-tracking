// The whole backend: serves the web app, runs the rooms over a WebSocket at /ws, draws invite QR codes,
// and answers /healthz. One process, no database: rooms live in memory and close when everyone has gone.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-generator';
import { Rooms, CODE_RE } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
const SECURITY = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

// A small fixed-window counter, per key (an IP address).
class Limiter {
  constructor(limit, windowMs){ this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  take(key, now = Date.now()){
    let h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) { h = {start: now, n: 0}; this.hits.set(key, h); }
    h.n++;
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k);
    return h.n <= this.limit;
  }
}

export function createServer(options = {}){
  const opts = {trustProxy: process.env.TRUST_PROXY === '1', cache: process.env.NODE_ENV === 'production', log: console, ...options};
  const rooms = options.rooms || new Rooms(options.roomOptions);
  const fileCache = new Map();
  const creates = new Limiter(12, 10 * 60e3);   // new rooms per IP per 10 minutes
  const lookups = new Limiter(90, 60e3);        // code lookups and joins per IP per minute
  const sockets = new Map();                    // open sockets per IP

  const ipOf = req => {
    if (opts.trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
    return req.socket.remoteAddress || '?';
  };
  const originOf = req => {
    const proto = opts.trustProxy && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0] : (req.socket.encrypted ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  };

  async function file(rel){
    if (opts.cache && fileCache.has(rel)) return fileCache.get(rel);
    const body = await readFile(path.join(ROOT, rel));
    const f = {body, etag: '"' + createHash('sha1').update(body).digest('base64url').slice(0, 16) + '"', type: TYPES[path.extname(rel)] || 'application/octet-stream'};
    if (opts.cache) fileCache.set(rel, f);
    return f;
  }
  // Only files under public/ and shared/ are ever served.
  function staticPath(pathname){
    if (pathname === '/' || /^\/r\/[A-Za-z]{4}\/?$/.test(pathname)) return 'public/index.html';
    let base = 'public', rest = pathname.slice(1);
    if (pathname.startsWith('/shared/')) { base = 'shared'; rest = pathname.slice(8); }
    let decoded;
    try { decoded = decodeURIComponent(rest); } catch { return null; }
    const full = path.resolve(ROOT, base, decoded);
    if (!full.startsWith(path.resolve(ROOT, base) + path.sep)) return null;
    return path.relative(ROOT, full);
  }
  function send(res, status, body, headers = {}){
    res.writeHead(status, {...SECURITY, ...headers});
    res.end(body);
  }
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', {Allow: 'GET, HEAD'});
    if (p === '/healthz') return json(res, 200, {ok: true, ...rooms.stats()});
    let m = p.match(/^\/api\/rooms\/([A-Za-z]{4})$/);
    if (m) {
      if (!lookups.take(ipOf(req))) return json(res, 429, {error: 'slow_down'});
      const room = rooms.get(m[1]);
      return room ? json(res, 200, room.summary()) : json(res, 404, {error: 'not_found'});
    }
    m = p.match(/^\/qr\/([A-Za-z]{4})\.svg$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return send(res, 404, 'Not found');
      const qr = qrcode(0, 'M');
      qr.addData(`${originOf(req)}/r/${code}`);
      qr.make();
      return send(res, 200, qr.createSvgTag({cellSize: 8, margin: 2, scalable: true}), {'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600'});
    }
    const rel = staticPath(p);
    if (!rel) return send(res, 404, 'Not found');
    try {
      const f = await file(rel);
      const cache = rel.startsWith('public/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      if (req.headers['if-none-match'] === f.etag) return send(res, 304, '', {ETag: f.etag, 'Cache-Control': cache});
      send(res, 200, req.method === 'HEAD' ? '' : f.body, {'Content-Type': f.type, ETag: f.etag, 'Cache-Control': cache});
    } catch {
      send(res, 404, 'Not found', {'Content-Type': 'text/plain; charset=utf-8'});
    }
  });

  const wss = new WebSocketServer({noServer: true, maxPayload: 4096});
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    const ip = ipOf(req);
    let sameSite = true;
    if (origin) { try { sameSite = new URL(origin).host === req.headers.host; } catch { sameSite = false; } }
    const bad = url.pathname !== '/ws' || !sameSite || (sockets.get(ip) || 0) >= 30;
    if (bad) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, ip));
  });

  wss.on('connection', (ws, req, ip) => {
    sockets.set(ip, (sockets.get(ip) || 0) + 1);
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const conn = {
      send: obj => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      close: (code, reason) => { try { ws.close(code, reason); } catch {} }
    };
    let room = null, pid = null, budget = {start: Date.now(), n: 0};
    const fail = (error, extra = {}) => conn.send({t: 'error', error, ...extra});
    const bind = (r, player) => {
      room = r; pid = player.id;
      conn.send({t: 'joined', code: r.code, pid: player.id, token: player.token});
      r.connect(player.id, conn);
    };

    ws.on('message', raw => {
      const now = Date.now();
      if (now - budget.start > 10000) budget = {start: now, n: 0};
      if (++budget.n > 60) return conn.close(1008, 'Too many messages');
      let msg;
      try { msg = JSON.parse(raw); } catch { return fail('bad'); }
      if (!msg || typeof msg.t !== 'string') return fail('bad');
      if (msg.t === 'ping') return conn.send({t: 'pong'});
      if (msg.t === 'create' || msg.t === 'join' || msg.t === 'resume') {
        if (room) return fail('already');
        if (msg.t === 'create') {
          if (!creates.take(ip)) return fail('slow_down');
          const r = rooms.create();
          if (!r) return fail('busy');
          const added = r.addPlayer(msg.name);
          if (added.error) { rooms.rooms.delete(r.code); return fail(added.error); }
          return bind(r, added.player);
        }
        if (!lookups.take(ip)) return fail('slow_down');
        const r = rooms.get(msg.code);
        if (!r) return fail('not_found', {code: String(msg.code || '').slice(0, 8)});
        if (msg.t === 'join') {
          const added = r.addPlayer(msg.name);
          return added.error ? fail(added.error) : bind(r, added.player);
        }
        const player = r.check(msg.pid, msg.token);
        return player ? bind(r, player) : fail('expired');
      }
      if (!room) return fail('not_in_room');
      const err = room.handle(pid, msg);
      if (err) fail(err, {about: msg.t});
    });
    ws.on('close', () => {
      sockets.set(ip, Math.max(0, (sockets.get(ip) || 1) - 1));
      if (!sockets.get(ip)) sockets.delete(ip);
      if (room) room.disconnect(pid, conn);
    });
    ws.on('error', () => {});
  });

  // Ping every socket; drop the ones that stopped answering. Tell phones the line is alive too.
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
      if (ws.readyState === 1) ws.send('{"t":"hb"}');
    }
  }, options.heartbeatMs || 15000);
  const sweep = setInterval(() => rooms.sweep(), 60e3);
  beat.unref(); sweep.unref();

  return {
    server, wss, rooms,
    listen(port = 0, host){ return new Promise(r => server.listen(port, host, () => r(server.address().port))); },
    close(){
      clearInterval(beat); clearInterval(sweep);
      rooms.dispose();
      for (const ws of wss.clients) ws.terminate();
      return new Promise(r => server.close(() => r()));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createServer();
  const port = await app.listen(Number(process.env.PORT) || 8080, '0.0.0.0');
  console.log(`Stone Paper Scissors is up on port ${port}`);
  const stop = () => { app.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
