// Online play: this phone talks to the room server over a WebSocket. The server holds every throw
// until the last person has thrown; this file draws what the server says, and reconnects on its own.
import { activeSeats, standings } from '/shared/engine.js';
import { lc, MAX_ONLINE } from '/shared/rules.js';
import { namesList } from '/shared/words.js';
import { prefs, savePrefs } from './prefs.js';
import { onlineSettingsHTML } from './settings.js';
import * as ui from './ui.js';
const { $, esc } = ui;

const KEY = 'kheeladi-sps-online-v1';
const ERRORS = {
  not_found: 'No game with that code. Check the letters, or host a new game.',
  full: 'That game is full.',
  name: 'Type your name first (anything but “You”).',
  slow_down: 'Too many tries. Wait a minute, then try again.',
  busy: 'The game server is busy. Try again in a minute.',
  offline: 'Couldn’t reach the game server. Check your connection and try again.'
};

let ws = null, state = null, firstMsg = null, retry = 0, retryTimer = 0, lastMsg = 0, offset = 0, leaving = false;
let session = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })();
const view = {
  shown: 0, animating: false, anim: 0, matchId: 0, tableKey: '', displayed: '', resultAt: 0,
  endShown: 0, overTimer: 0, noticeId: 0, fresh: true, joining: null, joinTimer: 0, qrCode: '', playerCount: 0
};
const saveSession = () => { try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch (e) {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const serverNow = () => Date.now() + offset;

export const hasSession = () => !!session;
export const inGame = () => !!state;

// ---------- The connection ----------
function connect(first){
  clearTimeout(retryTimer);
  leaving = false;
  if (first) firstMsg = first;
  else if (session) firstMsg = {t: 'resume', code: session.code, pid: session.pid, token: session.token};
  if (ws && ws.readyState <= 1) {
    if (ws.readyState === 1 && firstMsg) { ws.send(JSON.stringify(firstMsg)); firstMsg = null; }
    return;
  }
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    if (sock !== ws) return;
    retry = 0; lastMsg = Date.now();
    if (firstMsg) { sock.send(JSON.stringify(firstMsg)); firstMsg = null; }
  };
  sock.onmessage = e => {
    if (sock !== ws) return;
    lastMsg = Date.now(); clearTimeout(pongTimer);
    let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
    onMessage(msg);
  };
  sock.onclose = () => {
    if (sock !== ws) return;
    ws = null;
    if (view.joining) return joinFailed('offline');
    if (session && !leaving) { setConn(true); scheduleRetry(); }
  };
}
function scheduleRetry(){
  clearTimeout(retryTimer);
  const delay = Math.min(8000, 400 * 2 ** retry) + Math.random() * 300;
  retry++;
  retryTimer = setTimeout(() => connect(), delay);
}
function send(obj){
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
  setConn(true);
  return false;
}
function setConn(down){ $('#conn').hidden = !(down && session && ['lobby', 'play', 'end'].includes(ui.screen)); }
// Phones drop sockets when the screen locks or the signal goes: whenever the page comes back, ask the
// server for a pong, and reconnect if none comes within three seconds.
let pongTimer = 0;
function reconnectNow(){ clearTimeout(pongTimer); const old = ws; ws = null; try { old && old.close(); } catch (e) {} connect(); }
function wake(){
  if (!session || leaving) return;
  if (!ws || ws.readyState > 1) return reconnectNow();
  if (ws.readyState === 0) return;
  try { ws.send('{"t":"ping"}'); } catch (e) { return reconnectNow(); }
  clearTimeout(pongTimer);
  pongTimer = setTimeout(reconnectNow, 3000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
window.addEventListener('online', wake);
window.addEventListener('pageshow', wake);
setInterval(() => { if (session && ws && ws.readyState === 1 && Date.now() - lastMsg > 35000) reconnectNow(); }, 5000);
setInterval(tick, 1000);

function onMessage(msg){
  switch (msg.t) {
    case 'joined':
      session = {code: msg.code, pid: msg.pid, token: msg.token}; saveSession();
      view.joining = null; clearTimeout(view.joinTimer); view.fresh = true;
      if (location.pathname !== '/r/' + msg.code) history.replaceState(null, '', '/r/' + msg.code);
      break;
    case 'state':
      offset = msg.now - Date.now();
      setConn(false);
      apply(msg);
      break;
    case 'error': onError(msg); break;
    case 'kicked': endSession('The host removed you from the game.'); break;
    case 'left': endSession(null); break;
  }
}
function onError(msg){
  if (view.joining) return joinFailed(msg.error);
  if (msg.error === 'expired' || msg.error === 'not_found') {
    const code = session && session.code;
    endSession(null);
    if (msg.error === 'expired' && code) { openInvite(code); ui.toast('You left that game. Join again with your name.'); }
    else ui.toast('That game has ended.');
    return;
  }
  if (msg.error === 'host') ui.toast('Only the host can do that.');
  else if (msg.error === 'not_enough') ui.toast('You need at least two people to start.');
}
function endSession(message){
  leaving = true;
  session = null; saveSession(); state = null;
  clearTimeout(retryTimer); clearTimeout(view.overTimer);
  view.anim++; view.animating = false; view.tableKey = ''; view.fresh = true;
  try { ws && ws.close(); } catch (e) {}
  ws = null;
  $('#conn').hidden = true;
  if (location.pathname !== '/') history.replaceState(null, '', '/');
  ui.show('home');
  if (message) ui.toast(message, 4500);
}

// ---------- Hosting and joining ----------
function startJoin(kind, msg){
  view.joining = kind;
  clearTimeout(view.joinTimer);
  view.joinTimer = setTimeout(() => { if (view.joining) { try { ws && ws.close(); } catch (e) {} joinFailed('offline'); } }, 15000);
  busyButtons(true);
  ui.audio();
  connect(msg);
}
function joinFailed(code){
  const kind = view.joining;
  view.joining = null; clearTimeout(view.joinTimer);
  busyButtons(false);
  const text = ERRORS[code] || ERRORS.offline;
  if (kind === 'invite') { $('#join-error').textContent = text; if (ui.screen !== 'join') ui.show('join'); }
  else { $('#online-error').textContent = text; if (ui.screen !== 'home') ui.show('home'); }
}
function busyButtons(on){
  for (const sel of ['[data-act="host"]', '[data-act="join"]', '#btn-join-link']) { const b = $(sel); if (b) b.disabled = on; }
}
function nameFrom(input, errEl){
  const name = input.value.trim();
  if (!name || /^you$/i.test(name)) { $(errEl).textContent = ERRORS.name; input.focus(); return null; }
  prefs.name = name; savePrefs();
  return name;
}
export function host(){
  $('#online-error').textContent = '';
  const name = nameFrom($('#my-name'), '#online-error');
  if (name) startJoin('create', {t: 'create', name});
}
export function joinByCode(){
  $('#online-error').textContent = '';
  const code = $('#join-code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { $('#online-error').textContent = 'Type the 4-letter room code.'; $('#join-code').focus(); return; }
  const name = nameFrom($('#my-name'), '#online-error');
  if (name) startJoin('join', {t: 'join', code, name});
}
export async function openInvite(code){
  code = code.toUpperCase();
  $('#join-big').textContent = code;
  $('#join-error').textContent = '';
  $('#join-name').value = prefs.name;
  $('#btn-join-link').dataset.code = code;
  $('#btn-join-link').disabled = false;
  ui.show('join');
  if (session && session.code === code) { $('#join-sub').textContent = 'Rejoining your game…'; connect(); return; }
  $('#join-sub').textContent = 'Stone Paper Scissors, on your own phone.';
  try {
    const r = await fetch(`/api/rooms/${code}`);
    if (r.status === 404) { $('#join-sub').textContent = 'No game with this code. It may have ended.'; $('#join-error').textContent = 'Ask for a new link, or host your own game.'; $('#btn-join-link').disabled = true; return; }
    const d = await r.json();
    if (d.host) {
      const people = `${d.players} ${d.players === 1 ? 'player' : 'players'} here`;
      $('#join-sub').textContent = `${d.host} is hosting · ${people}${d.phase === 'lobby' ? '' : '. A match is on, so you’ll watch until the next one.'}`;
    }
  } catch (e) {}
}
export function joinByLink(){
  $('#join-error').textContent = '';
  const name = nameFrom($('#join-name'), '#join-error');
  if (name) startJoin('invite', {t: 'join', code: $('#btn-join-link').dataset.code, name});
}
export function resume(){ if (session) { view.fresh = true; connect(); } }

// ---------- Applying what the server says ----------
const player = id => state.players.find(p => p.id === id);
const isHost = () => state.host === state.you;
function apply(s){
  const before = state;
  state = s;
  if (s.notice && s.notice.id !== view.noticeId) { if (!view.fresh) ui.toast(s.notice.text); view.noticeId = s.notice.id; }
  if (before && s.players.length > before.players.length && !view.fresh) ui.sfx.join();
  if (s.phase === 'lobby') {
    clearTimeout(view.overTimer);
    view.fresh = false; view.tableKey = '';
    renderLobby();
    if (ui.screen !== 'lobby') { ui.show('lobby'); window.scrollTo(0, 0); }
    return;
  }
  const m = s.match;
  if (view.fresh || m.id !== view.matchId) {
    view.shown = view.fresh && m.last ? m.last.round : 0;
    view.matchId = m.id; view.tableKey = ''; view.displayed = ''; view.endShown = 0; view.resultAt = 0;
    if (view.fresh && s.phase === 'over') { view.fresh = false; showEnd(); return; }
  }
  view.fresh = false;
  renderPlay();
}

// The table as ui.js draws it, from the server's view of the match.
function vm(s, asResult){
  const m = s.match, me = s.you, last = m.last;
  const seats = m.seats.map(x => ({...x, name: x.id === me ? 'You' : x.name, real: x.name, type: 'person',
    moves: m.history ? m.history[x.id].moves : [], results: m.history ? m.history[x.id].results : []}));
  const picks = {};
  if (asResult) Object.assign(picks, last.picks);
  else { for (const id of m.locked) picks[id] = -1; if (m.myPick != null) picks[me] = m.myPick; }
  const amIn = activeSeats(m).some(x => x.id === me);
  const conn = id => (s.players.find(p => p.id === id) || {}).connected;
  return {
    seats, mode: m.mode, bestOf: m.bestOf, target: m.target, totalRounds: m.totalRounds, throwoff: m.throwoff, throwoffFrom: m.throwoffFrom,
    winner: m.winner, over: m.over, round: asResult ? last.round : m.round, picks, revealed: asResult, result: asResult ? last : null,
    phase: !asResult && amIn && m.myPick == null ? 'pick' : 'wait', queue: [me], notes: {},
    slotText: p => !conn(p.id) ? 'Away' : m.sitting.includes(p.id) ? 'Sitting out' : p.id === me ? 'Your turn' : 'Picking'
  };
}
function ensureTable(M){
  const key = state.match.id + ':' + M.seats.map(x => x.id).join(',');
  if (view.tableKey !== key) { ui.buildTable(M); view.tableKey = key; view.displayed = ''; }
}
function meIn(){ return activeSeats(state.match).some(x => x.id === state.you); }
function showingResult(){
  const m = state.match, last = m.last;
  if (!last || last.round !== view.shown || state.phase === 'over') return !!last && state.phase === 'over';
  if (m.myPick != null) return false;
  if (meIn() && !m.waiting) return true;
  return Date.now() - view.resultAt < 3500;   // watchers see each result for a moment, then the next round
}
function renderPlay(){
  if (view.animating) return;   // the reveal under way picks up the newest state when it ends
  const s = state, m = s.match, last = m.last;
  if (view.endShown === m.id) { if (ui.screen === 'end') showEnd(true); return; }
  if (ui.screen !== 'play') { ui.show('play'); window.scrollTo(0, 0); }
  if (last && last.round > view.shown) { animate(); return; }
  const asResult = showingResult();
  const M = vm(s, asResult);
  ensureTable(M);
  const key = asResult ? 'result:' + last.round : 'round:' + m.round;
  if (view.displayed !== key) {
    if (!asResult) ui.resetCards(M, view.displayed.startsWith('result'));
    view.displayed = key;
  }
  ui.renderSeats(M); band(M); ui.renderTop(M); renderTray(M, asResult);
  if (s.phase === 'over' && !view.overTimer && view.endShown !== m.id) {
    view.overTimer = setTimeout(() => { view.overTimer = 0; if (state && state.phase === 'over') showEnd(); }, 1900);
  }
}
function band(M){
  const m = state.match, me = state.you;
  if (M.revealed) {
    const r = M.result;
    const timed = (r.random || []).filter(id => r.played.includes(id));
    const note = timed.length ? `<p class="note center">Time ran out for ${esc(namesList(timed.map(id => id === me ? 'you' : M.seats.find(x => x.id === id).name)))}, so a random throw was made.</p>` : '';
    return ui.renderBand(M, {note});
  }
  const act = activeSeats(m), pending = act.filter(x => !m.locked.includes(x.id) && !m.sitting.includes(x.id));
  let wait = `${m.locked.length} of ${act.length} locked in`;
  if (m.waiting) wait = 'Waiting for players to come back';
  else if (m.myPick != null && pending.length && pending.length <= 3) wait = 'Waiting for ' + namesList(pending.map(x => x.name));
  ui.renderBand(M, {wait});
}
function timerText(){
  const d = state.match && state.match.deadline;
  if (!d) return '';
  const secs = Math.ceil((d - serverNow()) / 1000);
  return secs > 0 ? `${secs} s left` : 'Time’s up';
}
const skipReady = () => isHost() && state.phase === 'playing' && !state.match.waiting && serverNow() - state.match.openedAt > 8000;
function renderTray(M, asResult){
  const s = state, m = s.match, me = s.you, seat = m.seats.find(x => x.id === me), tray = $('#tray');
  const msg = (b, sub) => `<div class="tray-row"><div class="tray-msg"><b>${esc(b)}</b><span>${esc(sub)}</span></div></div>`;
  const act = activeSeats(m), others = act.filter(x => x.id !== me && !m.locked.includes(x.id) && !m.sitting.includes(x.id));
  let html = '';
  if (s.phase === 'over') {
    html = `<button class="cta wide" type="button" data-act="o-results"><span>See who won</span><span class="arrow">${ui.ICON.arrow}</span></button>`;
  } else if (!seat || player(me).role === 'spectator') {
    html = msg('Watching', 'You’ll play in the next match.');
  } else if (!meIn()) {
    html = seat.out ? msg('You’re out', 'Stay and see who wins.') : msg('Watching the throw-off', 'Only the tied players throw now.');
  } else if (m.waiting) {
    html = msg('Waiting for players', 'Too few people are here to play this round.');
    if (isHost()) html += `<button class="btn2" type="button" data-act="o-end-ask">End the match</button>`;
  } else if (asResult) {
    html = ui.trayHead('Throw again', timerText() || 'Next round') + ui.picksHTML(true);
  } else if (m.myPick == null) {
    html = ui.trayHead('Your throw', timerText()) + ui.picksHTML(true);
  } else {
    html = ui.trayHead(m.myRandom ? 'Time ran out' : 'Locked in', timerText() || 'Tap another to change') + ui.picksHTML(true, m.myPick);
  }
  if (others.length && skipReady() && !asResult && s.phase === 'playing') {
    html += `<div class="tray-actions"><button class="textbtn" type="button" data-act="skip">Don’t wait for ${esc(namesList(others.map(x => x.name)))}</button></div>`;
  }
  tray.innerHTML = html;
  tray.dataset.skip = others.length && skipReady() ? '1' : '';
}
function tick(){
  if (!state || state.phase !== 'playing' || ui.screen !== 'play' || view.animating) return;
  const aside = $('#tray-aside'), t = timerText();
  if (aside && t) aside.textContent = t;
  const m = state.match, others = activeSeats(m).filter(x => x.id !== state.you && !m.locked.includes(x.id) && !m.sitting.includes(x.id));
  const wantSkip = others.length && skipReady() ? '1' : '';
  if ($('#tray').dataset.skip !== wantSkip || (view.resultAt && view.displayed.startsWith('result') && !showingResult())) renderPlay();
}
async function animate(){
  view.animating = true;
  const token = ++view.anim, s = state, last = s.match.last;
  const pre = vm(s, false);
  pre.round = last.round; pre.phase = 'reveal';
  pre.picks = Object.fromEntries(last.played.map(id => [id, -1]));
  pre.result = {...last}; pre.revealed = false;
  // Players knocked out by this round still sit at the table until the cards turn.
  for (const x of pre.seats) if (last.played.includes(x.id)) { x.out = false; x.tOut = false; }
  if (pre.throwoff && last.round < pre.throwoffFrom) pre.throwoff = null;
  ensureTable(pre);
  ui.resetCards(pre, false);
  ui.renderSeats(pre); ui.renderBand(pre, {wait: 'Everyone has thrown'}); ui.renderTop(pre);
  $('#tray').innerHTML = ui.trayHead('Stone, paper, scissors…') + ui.picksHTML(false);
  const live = () => token === view.anim && !!state;
  if (!(await ui.chantAndFlip(live))) { view.animating = false; return; }
  const post = vm(s, true);
  ui.renderSeats(post, true); ui.sfx.flip();
  await sleep(prefs.chant && !ui.reduceMotion.matches ? 480 : 220);
  if (!live()) { view.animating = false; return; }
  ui.renderSeats(post); band(post); ui.renderTop(post); ui.announce(post); ui.outcomeSound(post);
  view.shown = last.round; view.resultAt = Date.now(); view.displayed = 'result:' + last.round;
  view.animating = false;
  renderPlay();
}

// ---------- Throwing ----------
export function choose(move){
  if (!state || state.phase !== 'playing' || view.animating || !meIn()) return;
  const m = state.match;
  if (m.myPick === move) return;
  if (!send({t: 'pick', round: m.round, move})) return;
  m.myPick = move;
  if (!m.locked.includes(state.you)) m.locked.push(state.you);
  ui.sfx.pick(); ui.buzz(10);
  renderPlay();
}

// ---------- Lobby ----------
function renderLobby(){
  const s = state, me = s.you, hostP = player(s.host) || {name: 'The host'};
  $('#lobby-code').textContent = s.code;
  if (view.qrCode !== s.code) { $('#lobby-qr').src = `/qr/${s.code}.svg`; view.qrCode = s.code; }
  $('#lobby-site').textContent = location.host;
  const seated = s.players.filter(p => p.role === 'player'), watching = s.players.filter(p => p.role === 'spectator');
  const ready = seated.filter(p => p.connected).length;
  $('#lobby-count').textContent = `${seated.length} of ${MAX_ONLINE}`;
  const row = p => {
    const tags = [p.id === s.host ? 'Host' : '', p.id === me ? 'You' : '', p.role === 'spectator' ? 'Watching' : '', p.connected ? '' : 'Away'].filter(Boolean).join(' · ');
    const kick = isHost() && p.id !== me ? `<button class="kick" type="button" data-act="kick" data-pid="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${ui.ICON.close}</button>` : '<span></span>';
    return `<li class="rrow${p.connected ? '' : ' away'}">${ui.avatarHTML('person', p.name, p.color || '#8c8781')}<span class="rname">${esc(p.name)}<small>${esc(tags || 'Ready')}</small></span>${kick}</li>`;
  };
  $('#roster').innerHTML = seated.concat(watching).map(row).join('');
  $('#roster-hint').textContent = seated.length < 2 ? 'Waiting for at least one more person. Share the code or the QR code.'
    : watching.length ? 'The table is full. People watching take a seat when one frees up.' : seated.length < MAX_ONLINE ? `Room for ${MAX_ONLINE - seated.length} more.` : 'The table is full.';
  $('#lobby-settings').innerHTML = onlineSettingsHTML(s.settings, ready, isHost(), hostP.name);
  $('#lobby-bar').innerHTML = isHost()
    ? `<button class="cta wide" type="button" data-act="o-start"${ready < 2 ? ' disabled' : ''}><span>${ready < 2 ? 'Waiting for players to join' : `Start with ${ready} players`}</span><span class="arrow">${ui.ICON.arrow}</span></button>`
    : `<p class="waitline">Waiting for ${esc(hostP.name)} to start <span class="dots"><i></i><i></i><i></i></span></p>`;
  syncPrefToggles();
}
function syncPrefToggles(){ document.querySelectorAll('[data-pref]').forEach(i => { i.checked = prefs[i.dataset.pref]; }); }
export function setSetting(key, val){
  if (!state || !isHost()) return;
  const settings = {...state.settings, [key]: key === 'mode' ? val : +val};
  state.settings = settings;
  renderLobby();
  send({t: 'settings', settings});
}
export function start(){ send({t: 'start'}); }
export function kick(pid){
  const p = player(pid);
  if (p) ui.confirmSheet(`Remove ${p.name}?`, 'They can join again with the code.', 'Remove', () => send({t: 'kick', pid}));
}
export function skip(){ send({t: 'skip', round: state.match.round}); }
export function rematch(){ send({t: 'start'}); }
export function toLobby(){ send({t: 'lobby'}); }
export function leaveAsk(){
  if (!state) return endSession(null);
  const inMatch = state.phase === 'playing' && state.match.seats.some(x => x.id === state.you);
  if (inMatch && isHost()) return ui.confirmSheet('End the match for everyone?', 'Everyone goes back to the lobby. Scores from this match won’t be kept.', 'End match', () => send({t: 'end'}));
  ui.confirmSheet('Leave this game?', inMatch ? 'You’ll be out of this match. You can join again with the code.' : isHost() ? 'Someone else becomes the host.' : 'You can join again with the code.', 'Leave', leave);
}
export function endAsk(){ ui.confirmSheet('End the match for everyone?', 'Everyone goes back to the lobby.', 'End match', () => send({t: 'end'})); }
export function leave(){ send({t: 'leave'}); endSession(null); }
export function inviteLink(){ return `${location.origin}/r/${state.code}`; }
export async function share(btn){
  const url = inviteLink();
  if (navigator.share) {
    try { await navigator.share({title: 'Stone Paper Scissors', text: `Join my game of Stone Paper Scissors. Room code ${state.code}.`, url}); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  ui.copyText(url, btn);
}

// ---------- End of the match ----------
function showEnd(quiet){
  clearTimeout(view.overTimer); view.overTimer = 0;
  const s = state, m = s.match;
  view.endShown = m.id;
  const M = vm(s, !!m.last);
  const order = standings(M);
  const me = M.seats.find(x => x.id === s.you);
  const subjects = me ? [me, ...M.seats.filter(x => x !== me)] : M.seats;
  const hostP = player(s.host) || {name: 'the host'};
  ui.renderEnd(M, {
    order, subjects, reads: null, level: null, findsTitle: 'What the table showed', celebrate: !quiet, keepScroll: quiet,
    actionsHTML: isHost()
      ? `<button class="cta wide" type="button" data-act="o-rematch"><span>Rematch</span><span class="arrow" data-icon="again"></span></button><button class="btn2" type="button" data-act="o-lobby">Lobby</button>`
      : `<p class="waitline end-wait">Waiting for ${esc(hostP.name)} to start the next match <span class="dots"><i></i><i></i><i></i></span></p><button class="btn2" type="button" data-act="leave-ask">Leave</button>`
  });
}
export function results(){ if (state && state.phase === 'over') showEnd(); }
export function summary(){
  const M = vm(state, !!state.match.last);
  return ui.summaryText(M, standings(M)).replace(/\bYou\b/, (state.players.find(p => p.id === state.you) || {}).name || 'You');
}
export { lc };
