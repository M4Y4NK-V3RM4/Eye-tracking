// Rooms for online play. A room lives in memory: a host makes it, up to six people join from their
// own phones, and everyone else who joins watches. Throws stay on the server until the reveal.
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createMatch, playRound, nextRound, activeSeats, leaveMatch, seatOf } from '../shared/engine.js';
import { createSnakes, playSnakes, nextSnakes, activeSnakes, leaveSnakes, turnMs } from '../shared/snakes.js';
import { BEST_OF, ROUNDS, MODES, TIMERS, DEFAULT_TIMER, MAX_ONLINE, isMove, rint } from '../shared/rules.js';

// Each game runs the same loop: everyone throws at once, the server reveals, the next throw opens.
const GAMES = {
  sps: {
    create: createMatch, play: playRound, next: nextRound, active: activeSeats, leave: leaveMatch,
    pause: (res, opts) => opts.resultPause,
    seat: s => ({id: s.id, name: s.name, color: s.color, score: s.score, out: s.out, tOut: s.tOut, left: s.left, outRound: s.outRound})
  },
  snakes: {
    create: createSnakes, play: playSnakes, next: nextSnakes, active: activeSnakes, leave: leaveSnakes,
    // the next throw opens once the dice, the moves and the slides have played out on every phone
    pause: (res, opts) => turnMs(res) + opts.snakesPause,
    seat: s => ({id: s.id, name: s.name, color: s.color, pos: s.pos, wins: s.wins, snakes: s.snakes, ladders: s.ladders, left: s.left, out: false, tOut: false, score: 0})
  }
};
export const GAME_IDS = Object.keys(GAMES);

export const COLORS = ['#137eff', '#d54141', '#1a8f4a', '#c46a00', '#7a4fd6', '#0b7f86'];
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';   // no vowels, so codes never spell words; no I/O to misread
const MAX_PEOPLE = 12;                          // six players and six watching
export const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

const DEFAULTS = {
  maxRooms: 2000,
  hostGrace: 30000,     // how long before an absent host hands over
  firstPause: 800,      // the first round's clock starts once the table is on screen
  resultPause: 1500,    // later rounds: a moment to see the last result first
  snakesPause: 250,     // Snakes & Ladders: a beat after the last move, before the next throw's clock
  timerMs: null,        // tests only: overrides the room's seconds to throw
  emptyTtl: 15 * 60e3   // a room nobody is connected to is closed after this
};

export function cleanName(s){
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 16).trim();
}
const newId = () => randomBytes(6).toString('base64url');
const newToken = () => randomBytes(18).toString('base64url');
function sameToken(a, b){
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Rooms {
  constructor(opts = {}){
    this.opts = {...DEFAULTS, ...opts};
    this.rooms = new Map();
  }
  newCode(){
    for (let i = 0; i < 100; i++) {
      let c = '';
      for (let j = 0; j < 4; j++) c += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }
  create(){
    if (this.rooms.size >= this.opts.maxRooms) this.sweep();
    if (this.rooms.size >= this.opts.maxRooms) return null;
    const code = this.newCode();
    if (!code) return null;
    const room = new Room(code, this.opts);
    this.rooms.set(code, room);
    return room;
  }
  get(code){ return this.rooms.get(String(code || '').trim().toUpperCase()); }
  sweep(now = Date.now()){
    for (const r of this.rooms.values()) {
      if (r.connectedCount() === 0 && now - r.emptySince > this.opts.emptyTtl) { r.dispose(); this.rooms.delete(r.code); }
    }
  }
  stats(){
    let people = 0, connected = 0;
    for (const r of this.rooms.values()) { people += r.players.size; connected += r.connectedCount(); }
    return {rooms: this.rooms.size, people, connected};
  }
  dispose(){ for (const r of this.rooms.values()) r.dispose(); this.rooms.clear(); }
}

export class Room {
  constructor(code, opts){
    this.code = code;
    this.opts = opts;
    this.players = new Map();          // id -> {id, token, name, color, role, connected, joinedAt, awaySince, conn}
    this.hostId = null;
    this.settings = {game: 'sps', bestOf: 5, mode: 'points', rounds: 5, timer: DEFAULT_TIMER};
    this.phase = 'lobby';              // lobby | playing | over
    this.match = null;
    this.matchCount = 0;
    this.picks = {};                   // this round's throws, never sent to anyone else before the reveal
    this.sitting = new Set();          // sitting this round out (away, or the host chose not to wait)
    this.random = new Set();           // thrown at random when the timer ran out
    this.deadline = null;
    this.pickMs = 0;
    this.roundOpenedAt = 0;
    this.notBefore = 0;                // no reveal before this: the last one is still playing out
    this.last = null;                  // the last revealed round
    this.notice = null;
    this.noticeCount = 0;
    this.rev = 0;
    this.timers = new Map();
    this.joinSeq = 0;
    this.emptySince = Date.now();
  }

  // ----- people -----
  list(){ return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt); }
  playersIn(role){ return this.list().filter(p => p.role === role); }
  connectedCount(){ return this.list().filter(p => p.connected).length; }
  freeColor(){
    const used = new Set(this.playersIn('player').map(p => p.color));
    return COLORS.find(c => !used.has(c)) || COLORS[0];
  }
  uniqueName(name, except){
    const taken = new Set(this.list().filter(p => p.id !== except).map(p => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) { const n = `${name.slice(0, 13)} ${i}`; if (!taken.has(n.toLowerCase())) return n; }
  }
  addPlayer(rawName){
    const name = cleanName(rawName);
    if (!name || /^you$/i.test(name)) return {error: 'name'};
    if (this.players.size >= MAX_PEOPLE) return {error: 'full'};
    const seats = this.playersIn('player').length;
    const role = this.phase === 'lobby' && seats < MAX_ONLINE ? 'player' : 'spectator';
    const p = {
      id: newId(), token: newToken(), name: this.uniqueName(name), color: role === 'player' ? this.freeColor() : null,
      role, connected: false, joinedAt: ++this.joinSeq, awaySince: Date.now(), conn: null
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    return {player: p};
  }
  check(pid, token){
    const p = this.players.get(pid);
    return p && sameToken(p.token, token) ? p : null;
  }
  connect(pid, conn){
    const p = this.players.get(pid);
    if (!p) return;
    if (p.conn && p.conn !== conn) p.conn.close(4000, 'Opened on another tab');
    p.conn = conn; p.connected = true; p.awaySince = null;
    this.clearTimer('host:' + pid);
    if (this.phase === 'playing' && this.picks[pid] == null) this.sitting.delete(pid);
    this.checkReveal();
    this.broadcast();
  }
  disconnect(pid, conn){
    const p = this.players.get(pid);
    if (!p || p.conn !== conn) return;
    p.conn = null; p.connected = false; p.awaySince = Date.now();
    if (!this.connectedCount()) this.emptySince = Date.now();
    // Rounds never wait: someone who drops off sits this round out, and can throw again once back.
    if (this.phase === 'playing' && this.picks[pid] == null && this.E.active(this.match).some(s => s.id === pid)) {
      this.sitting.add(pid);
      this.checkReveal();
    }
    if (pid === this.hostId) this.setTimer('host:' + pid, this.opts.hostGrace, () => {
      if (!p.connected && this.hostId === pid) { this.passHost(); this.broadcast(); }
    });
    this.broadcast();
  }
  passHost(){
    const next = this.list().filter(p => p.id !== this.hostId && p.connected)
      .sort((a, b) => (a.role === 'player' ? 0 : 1) - (b.role === 'player' ? 0 : 1) || a.joinedAt - b.joinedAt)[0];
    if (!next) return;
    this.hostId = next.id;
    this.say(`${next.name} is now the host`);
  }
  remove(pid, why){
    const p = this.players.get(pid);
    if (!p) return;
    if (this.match && !this.match.over && seatOf(this.match, pid)) {
      this.E.leave(this.match, pid);
      delete this.picks[pid]; this.sitting.delete(pid);
      if (this.match.over) this.finish();
    }
    this.players.delete(pid);
    this.clearTimer('host:' + pid);
    if (p.conn) { p.conn.send({t: why === 'kicked' ? 'kicked' : 'left'}); p.conn.close(1000, why); }
    this.say(why === 'kicked' ? `${p.name} was removed` : `${p.name} left`);
    if (this.hostId === pid) { this.hostId = null; this.passHost(); if (!this.hostId) this.hostId = this.list()[0]?.id || null; }
    if (!this.connectedCount()) this.emptySince = Date.now();
    if (this.phase === 'lobby') this.fillSeats();
    this.checkReveal();
    this.broadcast();
  }
  // Watchers take free seats whenever there is no match on.
  fillSeats(){
    for (const p of this.playersIn('spectator')) {
      if (this.playersIn('player').length >= MAX_ONLINE) break;
      p.role = 'player'; p.color = this.freeColor();
    }
  }
  say(text){ this.notice = {id: ++this.noticeCount, text}; }

  // ----- messages from a player -----
  handle(pid, msg){
    const p = this.players.get(pid);
    if (!p) return 'gone';
    const host = pid === this.hostId;
    const m = this.match;
    switch (msg.t) {
      case 'rename': {
        const name = cleanName(msg.name);
        if (!name || /^you$/i.test(name)) return 'name';
        if (this.phase === 'playing') return 'busy';
        p.name = this.uniqueName(name, pid);
        break;
      }
      case 'settings': {
        if (!host) return 'host';
        if (this.phase === 'playing') return 'busy';
        const s = msg.settings || {};
        if (GAME_IDS.includes(s.game)) this.settings.game = s.game;
        if (BEST_OF.includes(s.bestOf)) this.settings.bestOf = s.bestOf;
        if (MODES.includes(s.mode)) this.settings.mode = s.mode;
        if (ROUNDS.includes(s.rounds)) this.settings.rounds = s.rounds;
        if (TIMERS.includes(s.timer)) this.settings.timer = s.timer;
        break;
      }
      case 'start':
        if (!host) return 'host';
        if (this.phase === 'playing') return 'busy';
        return this.start();
      case 'lobby':
        if (!host) return 'host';
        if (this.phase !== 'over') return 'busy';
        this.phase = 'lobby'; this.match = null; this.last = null; this.fillSeats();
        break;
      case 'end':
        if (!host) return 'host';
        if (this.phase !== 'playing') return 'busy';
        this.clearRoundTimers();
        this.phase = 'lobby'; this.match = null; this.last = null; this.fillSeats();
        this.say(`${p.name} ended the match`);
        break;
      case 'pick': {
        if (this.phase !== 'playing' || msg.round !== m.round || !isMove(msg.move)) return 'late';
        if (!this.E.active(m).some(s => s.id === pid)) return 'not_playing';
        this.picks[pid] = msg.move; this.sitting.delete(pid); this.random.delete(pid);
        this.checkReveal();
        break;
      }
      case 'unpick':
        if (this.phase !== 'playing' || msg.round !== m.round) return 'late';
        delete this.picks[pid];
        break;
      case 'skip': {
        if (!host) return 'host';
        if (this.phase !== 'playing' || msg.round !== m.round) return 'late';
        for (const s of this.E.active(m)) if (this.picks[s.id] == null) this.sitting.add(s.id);
        this.checkReveal();
        break;
      }
      case 'kick':
        if (!host) return 'host';
        if (msg.pid === pid || !this.players.has(msg.pid)) return 'bad';
        this.remove(msg.pid, 'kicked');
        return null;
      case 'leave':
        this.remove(pid, 'left');
        return null;
      default:
        return 'bad';
    }
    this.broadcast();
    return null;
  }

  // ----- the match -----
  start(){
    this.fillSeats();
    const seats = this.playersIn('player').filter(p => p.connected);
    if (seats.length < 2) return 'not_enough';
    this.E = GAMES[this.settings.game];
    this.match = this.E.create({seats: seats.map(p => ({id: p.id, name: p.name, color: p.color})), ...this.settings, id: ++this.matchCount});
    this.match.game = this.settings.game;
    this.phase = 'playing';
    this.last = null;
    this.openRound(this.opts.firstPause);
    this.broadcast();
    return null;
  }
  // Every round runs on the clock: a short pause, then the seconds to throw. The cards turn as soon as
  // everyone has thrown, or when time is up.
  openRound(pause){
    this.picks = {}; this.random = new Set(); this.sitting = new Set();
    for (const s of this.E.active(this.match)) if (!this.players.get(s.id)?.connected) this.sitting.add(s.id);
    const now = Date.now();
    this.roundOpenedAt = now;
    this.notBefore = now + pause;
    this.pickMs = this.opts.timerMs ?? this.settings.timer * 1000;
    this.deadline = now + pause + this.pickMs;
    const round = this.match.round;
    this.setTimer('deadline', this.deadline - now, () => this.timeUp(round));
  }
  timeUp(round){
    if (this.phase !== 'playing' || this.match.round !== round) return;
    for (const s of this.E.active(this.match)) {
      if (this.picks[s.id] != null || this.sitting.has(s.id)) continue;
      if (this.players.get(s.id)?.connected) { this.picks[s.id] = rint(3); this.random.add(s.id); }
      else this.sitting.add(s.id);
    }
    this.checkReveal();
    this.broadcast();
  }
  pending(){
    if (this.phase !== 'playing') return [];
    return this.E.active(this.match).filter(s => this.picks[s.id] == null && !this.sitting.has(s.id));
  }
  // Too few people here to throw this round: wait for someone to come back, or for the host to end it.
  waiting(){
    if (this.phase !== 'playing' || this.pending().length) return false;
    return this.E.active(this.match).filter(s => this.picks[s.id] != null && !this.sitting.has(s.id)).length < 2;
  }
  checkReveal(){
    if (this.phase !== 'playing' || this.pending().length || this.waiting()) return;
    // Everyone threw while the last result was still playing out: reveal the moment it ends.
    const wait = this.notBefore - Date.now();
    if (wait > 0) {
      this.setTimer('reveal', wait, () => { this.checkReveal(); this.broadcast(); });
      return;
    }
    const m = this.match;
    const res = this.E.play(m, this.picks, [...this.sitting]);
    if (!res) return;
    res.random = [...this.random];
    this.last = res;
    if (m.over) this.finish();
    else { this.E.next(m); this.openRound(this.E.pause(res, this.opts)); }
  }
  finish(){
    this.clearRoundTimers();
    this.phase = 'over';
    this.deadline = null;
  }
  clearRoundTimers(){ this.clearTimer('deadline'); this.clearTimer('reveal'); this.picks = {}; this.sitting = new Set(); this.random = new Set(); }

  // ----- what each phone sees -----
  view(pid){
    const m = this.match;
    const v = {
      t: 'state', code: this.code, rev: this.rev, now: Date.now(), you: pid, host: this.hostId, phase: this.phase,
      settings: {...this.settings}, notice: this.notice,
      players: this.list().map(p => ({id: p.id, name: p.name, color: p.color, role: p.role, connected: p.connected})),
      match: null
    };
    if (m) {
      const act = this.E.active(m);
      v.match = {
        id: m.id, game: m.game, mode: m.mode, bestOf: m.bestOf, target: m.target, totalRounds: m.totalRounds, round: m.round,
        throwoff: m.throwoff, throwoffFrom: m.throwoffFrom, over: m.over, winner: m.winner,
        seats: m.seats.map(this.E.seat),
        locked: act.filter(s => this.picks[s.id] != null).map(s => s.id),
        sitting: [...this.sitting],
        myPick: this.picks[pid] ?? null,
        myRandom: this.random.has(pid),
        deadline: this.deadline,
        pickMs: this.pickMs,
        openedAt: this.roundOpenedAt,
        notBefore: this.notBefore,
        waiting: this.waiting(),
        last: this.last,
        history: m.over ? Object.fromEntries(m.seats.map(s => [s.id, {moves: s.moves, results: s.results}])) : null
      };
    }
    return v;
  }
  broadcast(){
    this.rev++;
    for (const p of this.players.values()) if (p.conn) p.conn.send(this.view(p.id));
  }
  summary(){
    const host = this.players.get(this.hostId);
    return {code: this.code, game: this.settings.game, host: host ? host.name : null, players: this.playersIn('player').length, phase: this.phase, full: this.players.size >= MAX_PEOPLE};
  }

  // ----- timers -----
  setTimer(key, ms, fn){
    this.clearTimer(key);
    const t = setTimeout(() => { this.timers.delete(key); fn(); }, ms);
    t.unref?.();
    this.timers.set(key, t);
  }
  clearTimer(key){ const t = this.timers.get(key); if (t) { clearTimeout(t); this.timers.delete(key); } }
  dispose(){
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const p of this.players.values()) if (p.conn) p.conn.close(1001, 'Room closed');
  }
}
