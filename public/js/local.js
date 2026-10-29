// Play on one phone: against bots, or passing the phone around with secret picks.
import { SHAPES } from '/shared/rules.js';
import { createMatch, playRound, nextRound, activeSeats, standings } from '/shared/engine.js';
import { botChoose, LEVELS } from '/shared/bots.js';
import { isYou, namesList } from '/shared/words.js';
import { prefs, savePrefs } from './prefs.js';
import { localWinHTML } from './settings.js';
import * as ui from './ui.js';
const { $, $$, esc } = ui;

const SEATS = ['#137eff', '#d54141', '#1a8f4a', '#c46a00', '#7a4fd6', '#0b7f86', '#c43a7d', '#8b5a2b'];
const BOT_NAMES = ['Imarti', 'Laddoo', 'Jalebi', 'Barfi', 'Kaju', 'Peda', 'Rabri', 'Gulab'];
const KEY = 'kheeladi-sps-setup-v1';

// ---------- Setup ----------
function freshSetup(){
  return {count: 2, players: BOT_NAMES.map((_, i) => ({type: i === 0 ? 'person' : 'bot', name: '', edited: false})), level: 'sharp', bestOf: 5, mode: 'points', rounds: 5};
}
function loadSetup(){
  const s = freshSetup();
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d) return s;
    if (d.count >= 2 && d.count <= 8) s.count = d.count | 0;
    if (Array.isArray(d.players)) d.players.slice(0, 8).forEach((p, i) => {
      if (p && (p.type === 'person' || p.type === 'bot')) s.players[i].type = p.type;
      if (p && p.edited && typeof p.name === 'string' && p.name.trim()) { s.players[i].name = p.name.slice(0, 16); s.players[i].edited = true; }
    });
    if (LEVELS[d.level]) s.level = d.level;
    if ([1, 3, 5, 7].includes(d.bestOf)) s.bestOf = d.bestOf;
    const mode = d.mode || d.groupMode;
    if (['points', 'knockout'].includes(mode)) s.mode = mode;
    if ([3, 5, 7, 10].includes(d.rounds)) s.rounds = d.rounds;
  } catch (e) {}
  return s;
}
const S = loadSetup();
function saveSetup(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
const seatsInUse = () => S.players.slice(0, S.count);
const personCount = () => seatsInUse().filter(p => p.type === 'person').length;
function defaultName(i, type){
  if (type === 'bot') return BOT_NAMES[i];
  if (i === 0) return personCount() >= 2 ? 'Player 1' : 'You';
  return `Player ${i + 1}`;
}
function seatName(i){ const p = S.players[i]; return p.edited && p.name.trim() ? p.name.trim() : defaultName(i, p.type); }

export function renderSetup(){
  const n = S.count, persons = personCount(), bots = n - persons;
  $('#count').textContent = n;
  $('[data-act="minus"]').disabled = n <= 2;
  $('[data-act="plus"]').disabled = n >= 8;
  const list = $('#players'), ae = document.activeElement;
  const focused = ae && list.contains(ae) ? (ae.id ? '#' + ae.id : `[data-seat="${ae.dataset.seat}"][data-type="${ae.dataset.type}"]`) : null;
  list.innerHTML = seatsInUse().map((p, i) => `
    <li class="prow" style="--seat:${SEATS[i]}">
      ${ui.avatarHTML(p.type, seatName(i), SEATS[i])}
      <input class="name-input" id="name-${i}" type="text" maxlength="16" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="Seat ${i + 1} name" value="${esc(seatName(i))}" data-seat="${i}">
      <div class="seg" role="group" aria-label="Seat ${i + 1} is played by">
        <button type="button" data-seat="${i}" data-type="person" aria-pressed="${p.type === 'person'}">Person</button>
        <button type="button" data-seat="${i}" data-type="bot" aria-pressed="${p.type === 'bot'}">Bot</button>
      </div>
    </li>`).join('');
  if (focused && $(focused, list)) $(focused, list).focus();
  $('#players-hint').textContent =
    persons >= 2 ? `${persons} people share this phone. Each picks in secret, then passes it on.` :
    persons === 1 ? (bots ? 'Bots lock in before you pick, using only earlier rounds.' : '') :
    'Only bots. Sit back and watch them play.';
  $('#sec-bots').hidden = bots === 0;
  $$('[data-level]').forEach(b => b.setAttribute('aria-pressed', b.dataset.level === S.level));
  $('#level-hint').textContent = LEVELS[S.level];
  $('#local-win').innerHTML = localWinHTML(S, n);
  $('#opt-thoughts-row').hidden = bots === 0 && persons > 0;
  const other = seatsInUse().findIndex(p => p.type === 'bot');
  $('#play-label').textContent = persons === 0 ? 'Watch the bots play' : persons === 1 ? (bots === 1 ? `Play ${seatName(other)}` : `Play ${bots} bots`) : `Start with ${n} players`;
}
export function setSetting(key, val){
  if (key === 'bestOf' || key === 'rounds') S[key] = +val;
  if (key === 'mode') S.mode = val;
  saveSetup(); renderSetup();
}
export function setupClick(t){
  const d = t.dataset;
  if (d.level) { S.level = d.level; saveSetup(); renderSetup(); return true; }
  if (d.type && d.seat != null) {
    const p = S.players[+d.seat];
    if (p.type !== d.type) { p.type = d.type; p.edited = false; p.name = ''; }
    saveSetup(); renderSetup(); return true;
  }
  if (d.act === 'minus' && S.count > 2) { S.count--; saveSetup(); renderSetup(); return true; }
  if (d.act === 'plus' && S.count < 8) {
    const n = S.players[S.count];
    if (!n.edited) n.type = S.players[S.count - 1].type;
    S.count++; saveSetup(); renderSetup(); return true;
  }
  return false;
}
export function nameInput(t){
  const i = +t.dataset.seat, p = S.players[i];
  p.name = t.value; p.edited = true;
  const av = t.parentElement.querySelector('.avatar');
  if (p.type === 'person') av.textContent = ui.initial(t.value || defaultName(i, p.type));
  saveSetup();
  const other = seatsInUse().findIndex(q => q.type === 'bot');
  if (personCount() === 1 && S.count === 2 && other >= 0) $('#play-label').textContent = `Play ${seatName(other)}`;
}
export function nameChange(t){
  const p = S.players[+t.dataset.seat];
  if (!t.value.trim()) { p.edited = false; p.name = ''; renderSetup(); }
  saveSetup();
}

// ---------- The match ----------
let M = null, timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const wait = ms => new Promise(r => later(r, ms));
const activePersons = () => activeSeats(M).filter(p => p.type === 'person');

export const isPlaying = () => !!M;
export function play(){
  S.players.slice(0, S.count).forEach(p => { if (!p.name.trim()) p.edited = false; });
  saveSetup();
  ui.audio();
  const seats = seatsInUse().map((p, i) => ({id: i, name: seatName(i), type: p.type, color: SEATS[i]}));
  M = Object.assign(createMatch({seats, bestOf: S.bestOf, mode: S.mode, rounds: S.rounds}), {
    level: S.level, picks: {}, notes: {}, preds: {}, queue: [], lastPicker: null, phase: 'idle',
    revealed: false, result: null, reads: {}, token: 0, paused: false, notesOpen: false
  });
  ui.buildTable(M); ui.show('play'); window.scrollTo(0, 0);
  startRound(true);
}
export function end(){ clearTimers(); if (M) M.token++; M = null; ui.hideChant(); }

function lockedText(){
  const act = activeSeats(M), locked = act.filter(p => M.picks[p.id] !== undefined).length, bots = act.filter(p => p.type === 'bot');
  return act.length === 2 && bots.length === 1 && locked === 1 ? `${bots[0].name} has locked in` : `${locked} of ${act.length} locked in`;
}
function band(){
  let note = '';
  if (M.revealed && M.seats.length === 2 && prefs.thoughts) {
    const bot = M.seats.find(p => p.type === 'bot');
    if (bot && M.notes[bot.id]) note = `<p class="note">${ui.avatarHTML('bot', bot.name, bot.color, true)}<span><b>${esc(bot.name)}:</b> ${esc(M.notes[bot.id])}</span></p>`;
  }
  ui.renderBand(M, {wait: lockedText(), note});
}
function startRound(first){
  clearTimers();
  M.token++;
  if (!first) nextRound(M);
  M.picks = {}; M.notes = {}; M.preds = {}; M.result = null; M.revealed = false; M.lastPicker = null;
  const act = activeSeats(M);
  // Bots lock in first, from earlier rounds only.
  for (const p of act) if (p.type === 'bot') { const c = botChoose(M.level, p, act); M.picks[p.id] = c.move; M.notes[p.id] = c.note; M.preds[p.id] = c.preds; }
  M.queue = act.filter(p => p.type === 'person').map(p => p.id);
  ui.resetCards(M, !first);
  ui.renderTop(M); band();
  if (!M.queue.length) { M.phase = 'auto'; ui.renderSeats(M); renderTray(); const tok = M.token; later(() => tok === M.token && reveal(), 450); return; }
  promptNext();
}
function promptNext(){
  if (activePersons().length >= 2) showHandoff(M.queue[0]);
  else { M.phase = 'pick'; ui.renderSeats(M); renderTray(); }
}
export function choose(move){
  if (!M) return;
  if (M.phase === 'result' && activePersons().length === 1) startRound(false);
  if (M.phase !== 'pick') return;
  const id = M.queue.shift();
  M.picks[id] = move; M.lastPicker = id; M.phase = 'locking';
  ui.sfx.pick(); ui.buzz(10);
  const picks = $('#tray .picks'), tile = picks && $(`.pick[data-pick="${move}"]`, picks);
  if (picks) { picks.classList.add('has-chosen'); $$('.pick', picks).forEach(b => { b.disabled = b !== tile; }); if (tile) tile.classList.add('chosen'); }
  ui.renderSeats(M); band();
  const tok = M.token;
  if (!M.queue.length) later(() => tok === M.token && reveal(), 280);
  else later(() => tok === M.token && showHandoff(M.queue[0]), 380);
}
export function changeLast(){
  const id = M.lastPicker;
  if (id == null) return;
  delete M.picks[id];
  M.queue.unshift(id); M.lastPicker = null;
  $('#handoff').hidden = true;
  M.phase = 'pick'; ui.renderSeats(M); band(); renderTray();
}
export function ready(){
  $('#handoff').hidden = true;
  M.phase = 'pick'; ui.renderSeats(M); renderTray();
  const f = $('#tray .pick'); f && f.focus({preventScroll: true});
}
async function reveal(){
  const tok = M.token;
  M.phase = 'reveal'; renderTray();
  const quick = !prefs.chant || ui.reduceMotion.matches;
  if (!(await ui.chantAndFlip(() => M && tok === M.token))) return;
  const res = playRound(M, M.picks);
  for (const [bid, preds] of Object.entries(M.preds)) for (const [oid, pm] of Object.entries(preds)) {
    const r = M.reads[bid + '>' + oid] || (M.reads[bid + '>' + oid] = {hit: 0, n: 0});
    r.n++; if (res.picks[oid] === pm) r.hit++;
  }
  M.result = res; M.revealed = true;
  ui.renderSeats(M, true); ui.sfx.flip();
  await wait(quick ? 220 : 480);
  if (!M || tok !== M.token) return;
  ui.renderSeats(M); band(); ui.renderTop(M); ui.announce(M); ui.outcomeSound(M);
  if (M.over) { M.phase = 'over'; renderTray(); later(() => tok === M.token && showEnd(), 1900); return; }
  M.phase = 'result'; renderTray();
  if (!activePersons().length && !M.paused) later(() => tok === M.token && startRound(false), 1800);
}
function weighedHTML(){
  if (M.seats.length === 2 || !prefs.thoughts || !M.seats.some(p => p.type === 'bot')) return '';
  const bots = M.result && M.revealed ? M.result.played.map(id => M.seats[id]).filter(p => p.type === 'bot' && M.notes[p.id]) : [];
  if (!bots.length) return `<details class="weighed" aria-disabled="true"><summary tabindex="-1">${ui.avatarHTML('bot', '', '#137eff', true)}<span>What the bots weighed</span><small>After the reveal</small></summary></details>`;
  return `<details class="weighed"${M.notesOpen ? ' open' : ''}><summary>${ui.avatarHTML('bot', '', '#137eff', true)}<span>What the bots weighed</span></summary><ul>${bots.map(b => `<li>${ui.avatarHTML('bot', b.name, b.color, true)}<span><b>${esc(b.name)}</b> ${esc(M.notes[b.id])}</span></li>`).join('')}</ul></details>`;
}
function renderTray(){
  const tray = $('#tray'), ph = M.phase, ap = activePersons();
  let html = weighedHTML();
  if (ph === 'pick') {
    const p = M.seats[M.queue[0]];
    html += ui.trayHead(isYou(p) ? 'Your throw' : `${p.name}’s throw`, ap.length >= 2 ? 'Only you should see this' : '') + ui.picksHTML(true);
  } else if (ph === 'result' && ap.length === 1) {
    const p = ap[0];
    html += ui.trayHead(isYou(p) ? 'Throw again' : `${p.name}, throw again`, 'Pick to start the next round') + ui.picksHTML(true);
  } else if (ph === 'result' && ap.length >= 2) {
    html += `<button class="cta wide" type="button" data-act="next"><span>Next round</span><span class="arrow">${ui.ICON.arrow}</span></button>`;
  } else if (ph === 'result') {
    html += `<div class="tray-row"><div class="tray-msg"><b>Bots are playing</b><span>${M.paused ? 'Paused.' : 'The next round starts by itself.'}</span></div><button class="pill" type="button" data-act="${M.paused ? 'next' : 'pause'}">${M.paused ? 'Next round' : 'Pause'}</button></div>`;
  } else if (ph === 'over') {
    html += `<button class="cta wide" type="button" data-act="results"><span>See who won</span><span class="arrow">${ui.ICON.arrow}</span></button>`;
  } else {
    html += ui.trayHead(ph === 'auto' ? 'Bots are throwing' : 'Stone, paper, scissors…') + ui.picksHTML(false);
  }
  tray.innerHTML = html;
  const det = $('.weighed', tray);
  if (det && !det.hasAttribute('aria-disabled')) det.addEventListener('toggle', () => { M.notesOpen = det.open; });
}
function showHandoff(id){
  M.phase = 'handoff';
  const p = M.seats[id], ho = $('#handoff'), act = activeSeats(M), locked = act.filter(q => M.picks[q.id] !== undefined).length;
  ho.style.setProperty('--seat', p.color);
  $('#ho-step').textContent = `${ui.roundLabel(M)} · ${locked} of ${act.length} locked in`;
  $('#ho-title').innerHTML = `Pass to <span>${esc(p.name)}</span>`;
  $('#ho-ready span').textContent = `I’m ${p.name}`;
  const prev = M.lastPicker != null ? M.seats[M.lastPicker] : null;
  $('#ho-change').hidden = !prev;
  if (prev) $('#ho-change').textContent = `Wait, ${prev.name} wants to change`;
  ho.hidden = false;
  ui.renderSeats(M); band(); renderTray();
  setTimeout(() => $('#ho-ready').focus({preventScroll: true}), 60);
}
export function next(){ M.paused = false; startRound(false); }
export function pause(){ M.paused = true; clearTimers(); renderTray(); }
export function showEnd(){
  clearTimers();
  M.phase = 'done';
  const w = M.seats.find(p => p.id === M.winner), persons = M.seats.filter(p => p.type === 'person');
  const lostToBot = persons.length === 1 && w.type === 'bot';
  ui.renderEnd(M, {
    order: standings(M), subjects: persons.length ? persons : M.seats, reads: M.reads, level: M.level,
    findsTitle: persons.length ? (M.seats.some(p => p.type === 'bot') ? 'What the bots noticed' : 'What the table showed') : 'How the bots threw',
    celebrate: !lostToBot, lostToBot,
    actionsHTML: `<button class="cta wide" type="button" data-act="rematch"><span>Rematch</span><span class="arrow" data-icon="again"></span></button><button class="btn2" type="button" data-act="setup">Setup</button>`
  });
}
export const summary = () => ui.summaryText(M, standings(M));
export const phase = () => M && M.phase;
export { SHAPES };
