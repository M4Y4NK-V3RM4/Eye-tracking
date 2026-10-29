// The room server end to end, over real WebSockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../server/index.js';

async function boot(roomOptions = {}){
  const app = createServer({roomOptions: {awayGrace: 150, hostGrace: 250, revealGrace: 0, ...roomOptions}, heartbeatMs: 60000});
  const port = await app.listen(0, '127.0.0.1');
  return {app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws`};
}

// A phone: keeps the latest state and lets a test wait for a condition on it.
function phone(url){
  const ws = new WebSocket(url);
  const p = {ws, state: null, joined: null, errors: [], waiters: [], events: []};
  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    p.events.push(msg.t);
    if (msg.t === 'state') p.state = msg;
    if (msg.t === 'joined') p.joined = msg;
    if (msg.t === 'error') p.errors.push(msg.error);
    p.waiters = p.waiters.filter(w => !w(msg));
  });
  p.open = new Promise(r => ws.on('open', r));
  p.send = obj => ws.send(JSON.stringify(obj));
  p.until = (fn, ms = 2000) => new Promise((resolve, reject) => {
    if (p.state && fn(p.state)) return resolve(p.state);
    const t = setTimeout(() => reject(new Error('timed out; last state: ' + JSON.stringify(p.state?.match || p.state?.phase))), ms);
    p.waiters.push(msg => { if (msg.t === 'state' && fn(msg)) { clearTimeout(t); resolve(msg); return true; } return false; });
  });
  p.nextError = (ms = 2000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no error came')), ms);
    p.waiters.push(msg => { if (msg.t === 'error') { clearTimeout(t); resolve(msg.error); return true; } return false; });
  });
  p.close = () => ws.close();
  return p;
}

async function room(env, names){
  const host = phone(env.ws); await host.open;
  host.send({t: 'create', name: names[0]});
  await host.until(s => s.phase === 'lobby');
  const code = host.state.code;
  const others = [];
  for (const n of names.slice(1)) {
    const p = phone(env.ws); await p.open;
    p.send({t: 'join', code, name: n});
    await p.until(s => s.players.some(x => x.id === s.you));
    others.push(p);
  }
  await host.until(s => s.players.length === names.length);
  return {host, others, all: [host, ...others], code};
}

test('host a room, three join, throws stay hidden until everyone has thrown', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others, all, code} = await room(env, ['Mayank', 'Priya', 'Rahul']);
  assert.match(code, /^[A-Z]{4}$/);
  assert.equal(host.state.host, host.joined.pid);
  host.send({t: 'settings', settings: {mode: 'points', rounds: 3}});
  others[0].send({t: 'settings', settings: {rounds: 10}});
  assert.equal(await others[0].nextError(), 'host');
  host.send({t: 'start'});
  await Promise.all(all.map(p => p.until(s => s.phase === 'playing')));

  host.send({t: 'pick', round: 1, move: 1});
  const seen = await others[0].until(s => s.match?.locked.length === 1);
  assert.equal(seen.match.myPick, null);
  assert.equal(JSON.stringify(seen).includes('"picks"'), false, 'no throws in anyone else’s state');
  others[0].send({t: 'pick', round: 1, move: 0});
  others[1].send({t: 'pick', round: 1, move: 0});
  const after = await host.until(s => s.match.last && s.match.last.round === 1);
  assert.deepEqual(after.match.last.picks, {[host.joined.pid]: 1, [others[0].joined.pid]: 0, [others[1].joined.pid]: 0});
  assert.equal(after.match.round, 2);
  assert.equal(after.match.seats.find(s => s.id === host.joined.pid).score, 2);

  for (const r of [2, 3]) {
    for (const [i, p] of all.entries()) p.send({t: 'pick', round: r, move: i === 0 ? 1 : 0});
    await host.until(s => s.phase === 'over' || s.match.last.round === r);
  }
  const end = await host.until(s => s.phase === 'over');
  assert.equal(end.match.winner, host.joined.pid);
  assert.ok(end.match.history[host.joined.pid].moves.length === 3);
  all.forEach(p => p.close());
});

test('a phone that drops off can come back with its token', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others, code} = await room(env, ['Mayank', 'Priya']);
  host.send({t: 'start'});
  await others[0].until(s => s.phase === 'playing');
  const {pid, token} = others[0].joined;
  others[0].close();
  await host.until(s => s.players.some(p => p.id === pid && !p.connected));
  const back = phone(env.ws); await back.open;
  back.send({t: 'resume', code, pid, token: 'wrong'});
  assert.equal(await back.nextError(), 'expired');
  back.close();
  const again = phone(env.ws); await again.open;
  again.send({t: 'resume', code, pid, token});
  const s = await again.until(s => s.phase === 'playing');
  assert.equal(s.you, pid);
  await host.until(s => s.players.every(p => p.connected));
  host.close(); again.close();
});

test('a round does not wait for long for someone who has gone away', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others} = await room(env, ['A', 'B', 'C']);
  host.send({t: 'start'});
  await others[1].until(s => s.phase === 'playing');
  others[1].close();
  host.send({t: 'pick', round: 1, move: 0});
  others[0].send({t: 'pick', round: 1, move: 2});
  const s = await host.until(s => s.match?.last, 3000);
  assert.deepEqual(s.match.last.sat, [others[1].joined.pid]);
  assert.deepEqual(s.match.last.outs, []);
  host.close(); others[0].close();
});

test('the host can stop waiting, and the timer throws at random', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others, all} = await room(env, ['A', 'B', 'C']);
  host.send({t: 'start'});
  await Promise.all(all.map(p => p.until(s => s.phase === 'playing')));
  host.send({t: 'pick', round: 1, move: 0});
  others[0].send({t: 'pick', round: 1, move: 1});
  await host.until(s => s.match?.locked.length === 2);
  others[1].send({t: 'skip', round: 1});
  assert.equal(await others[1].nextError(), 'host');
  host.send({t: 'skip', round: 1});
  const s = await host.until(s => s.match?.last);
  assert.deepEqual(s.match.last.sat, [others[1].joined.pid]);
  host.send({t: 'end'});
  await host.until(s => s.phase === 'lobby');
  host.send({t: 'settings', settings: {timer: 10}});
  await host.until(s => s.settings.timer === 10);
  env.app.rooms.get(host.state.code).settings.timer = 10;
  env.app.rooms.get(host.state.code).opts.revealGrace = -9800;   // make the 10 s timer run out in 0.2 s
  host.send({t: 'start'});
  await host.until(s => s.phase === 'playing');
  host.send({t: 'pick', round: 1, move: 0});
  const timed = await others[0].until(s => s.match?.last, 3000);
  assert.equal(timed.match.last.random.length, 2);
  all.forEach(p => p.close());
});

test('six play, the seventh watches; the host hands over and can remove people', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others, all} = await room(env, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const roles = host.state.players.map(p => p.role);
  assert.deepEqual(roles, ['player', 'player', 'player', 'player', 'player', 'player', 'spectator']);
  const g = others[5];
  host.send({t: 'kick', pid: others[4].joined.pid});
  await host.until(s => s.players.length === 6);
  assert.equal(host.state.players.find(p => p.id === g.joined.pid).role, 'player', 'the watcher takes the free seat');
  host.close();
  const s = await others[0].until(s => s.host === others[0].joined.pid, 2000);
  assert.ok(s.notice.text.includes('now the host'));
  all.forEach(p => p.close());
});

test('names are cleaned and made unique; bad input is refused', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const {host, others, code} = await room(env, ['  Priya​  ', 'priya']);
  assert.deepEqual(host.state.players.map(p => p.name), ['Priya', 'priya 2']);
  const p = phone(env.ws); await p.open;
  p.send({t: 'join', code, name: 'You'});
  assert.equal(await p.nextError(), 'name');
  p.send({t: 'join', code: 'ZZZZ', name: 'Aman'});
  assert.equal(await p.nextError(), 'not_found');
  p.send('not json' === 1 ? {} : {t: 'pick', round: 1, move: 5});
  assert.equal(await p.nextError(), 'not_in_room');
  host.send({t: 'start'});
  await host.until(s => s.phase === 'playing');
  host.send({t: 'pick', round: 1, move: 7});
  assert.equal(await host.nextError(), 'late');
  [host, ...others, p].forEach(x => x.close());
});

test('the server serves the app, the shared rules, QR codes and a health check', async t => {
  const env = await boot(); t.after(() => env.app.close());
  const page = await fetch(env.base + '/r/KXQP');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(env.base + '/shared/rules.js')).status, 200);
  assert.equal((await fetch(env.base + '/shared/../server/rooms.js')).status, 404);
  assert.equal((await fetch(env.base + '/%2e%2e/package.json')).status, 404);
  const qr = await fetch(env.base + '/qr/KXQP.svg');
  assert.match(await qr.text(), /^<svg/);
  assert.equal((await fetch(env.base + '/api/rooms/KXQP')).status, 404);
  assert.deepEqual(Object.keys(await (await fetch(env.base + '/healthz')).json()), ['ok', 'rooms', 'people', 'connected']);
});
