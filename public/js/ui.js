// Drawing the game: card art, icons, sounds, and the table. Online and one-phone play both render
// through these functions from a match-shaped object M:
//   {seats, mode, bestOf, target, totalRounds, round, throwoff, throwoffFrom, picks, revealed, result,
//    phase, queue, notes, winner, slotText?}
import { SHAPES, lc, verbOf, rnd, rint } from '/shared/rules.js';
import { activeSeats } from '/shared/engine.js';
import { isYou, namesList } from '/shared/words.js';
import { prefs } from './prefs.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- Art ----------
export const ART = [
  // Stone: a river pebble
  '<ellipse cx="60" cy="99" rx="39" ry="6" fill="#141414" opacity=".13"/>' +
  '<path d="M17 71c-4-22 13-41 38-44 21-3 40 6 46 24 6 18-3 35-19 42-16 7-42 7-55 0-6-4-9-12-10-22z" fill="#8c8781"/>' +
  '<path d="M25 62c1-16 16-27 35-28 13-1 26 3 33 13-9-5-22-6-34-3-14 3-25 10-34 18z" fill="#a9a39c"/>' +
  '<path d="M22 83c11 9 36 10 52 4 11-4 18-11 21-20-1 12-9 22-23 27-16 5-38 3-50-11z" fill="#726d67"/>' +
  '<ellipse cx="43" cy="46" rx="10" ry="4.5" transform="rotate(-20 43 46)" fill="#cbc5bd"/>' +
  '<circle cx="75" cy="60" r="2.3" fill="#726d67"/><circle cx="50" cy="74" r="1.8" fill="#726d67"/><circle cx="85" cy="72" r="1.5" fill="#726d67"/>',
  // Paper: a ruled notebook page with a folded corner
  '<ellipse cx="60" cy="103" rx="33" ry="5" fill="#141414" opacity=".1"/>' +
  '<g transform="rotate(-7 60 58)">' +
  '<path d="M30 14h45l17 17v70H30z" fill="#fff" stroke="#cfc6bb" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<path d="M36 42h50M36 52h50M36 62h50M36 72h50M36 82h50M36 92h50" stroke="#8fbcff" stroke-width="2"/>' +
  '<path d="M43 16v83" stroke="#ef8f8f" stroke-width="2"/>' +
  '<path d="M75 14v17h17z" fill="#ebe3d8" stroke="#cfc6bb" stroke-width="2.2" stroke-linejoin="round"/></g>',
  // Scissors: open, blades up, red handles
  '<ellipse cx="60" cy="106" rx="31" ry="5" fill="#141414" opacity=".1"/>' +
  '<path d="M64 63 35 13c-1.6-2.6-5-1.3-4.2 1.7L54 66z" fill="#cdd4dd" stroke="#8a95a2" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M56 63 85 13c1.6-2.6 5-1.3 4.2 1.7L66 66z" fill="#e4e9ef" stroke="#8a95a2" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M57 64 43 83M63 64l14 19" stroke="#d54141" stroke-width="8" stroke-linecap="round"/>' +
  '<circle cx="38" cy="91" r="11" fill="none" stroke="#d54141" stroke-width="7"/>' +
  '<circle cx="82" cy="91" r="11" fill="none" stroke="#d54141" stroke-width="7"/>' +
  '<circle cx="60" cy="63" r="4.6" fill="#6f7a86"/><circle cx="59" cy="62" r="1.4" fill="#c9d0d8"/>'
];
export const artSVG = m => `<svg class="art" viewBox="0 0 120 120" aria-hidden="true" focusable="false">${ART[m]}</svg>`;
export function cat(body = '#141414', eye = '#fff', pupil = '#141414', collar = '#d54141'){
  return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M7.4 19 9.5 4.3c.1-.9 1.1-1.2 1.7-.6l8.3 7.8zM32.6 19 30.5 4.3c-.1-.9-1.1-1.2-1.7-.6l-8.3 7.8z" fill="${body}"/><ellipse cx="20" cy="23.6" rx="14.3" ry="12.7" fill="${body}"/><circle cx="14.3" cy="22.4" r="4.8" fill="${eye}"/><circle cx="25.7" cy="22.4" r="4.8" fill="${eye}"/><circle cx="15.5" cy="21.5" r="2.5" fill="${pupil}"/><circle cx="26.9" cy="21.5" r="2.5" fill="${pupil}"/><path d="M9.6 33.4Q20 39.6 30.4 33.4" stroke="${collar}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}
export const BACK = `${cat('#fff', '#141414', '#fff', '#d54141')}<span class="wm">KHEELADI</span>`;
export const faceHTML = m => `${artSVG(m)}<span class="fname">${SHAPES[m]}</span>`;
export const cardHTML = m => `<div class="card is-up"><div class="inner"><div class="back">${BACK}</div><div class="face">${faceHTML(m)}</div></div></div>`;
export const initial = name => (String(name).trim()[0] || '?').toUpperCase();
export function avatarHTML(type, name, color, sm){
  return `<span class="avatar${type === 'bot' ? ' bot' : ''}${sm ? ' sm' : ''}" style="--seat:${color}" aria-hidden="true">${type === 'bot' ? cat() : esc(initial(name))}</span>`;
}
export const ICON = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.1 9.3a3 3 0 1 1 4.3 2.7c-.9.4-1.4 1.1-1.4 2v.6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="currentColor"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5h3.6L12 5.6v12.8l-4.9-3.9H3.5z" fill="currentColor"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.5h3.6L12 5.6v12.8l-4.9-3.9H3.5z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor"/><path d="M8.3 10.5V8a3.7 3.7 0 0 1 7.4 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'
};
export function paintIcons(root = document){ $$('[data-icon]', root).forEach(n => { n.innerHTML = ICON[n.dataset.icon]; }); }

// ---------- Screens, sheets, toasts ----------
export let screen = 'home';
const SCREENS = ['home', 'join', 'lobby', 'play', 'end'];
export function show(name){
  screen = name;
  for (const s of SCREENS) $('#screen-' + s).hidden = s !== name;
  if (name !== 'play') $('#handoff').hidden = true;
  if (name !== 'end') { confettiRun++; $('#confetti').hidden = true; }
}
let lastFocus = null;
export function openSheet(id){
  lastFocus = document.activeElement;
  const s = $('#' + id); s.hidden = false;
  setTimeout(() => { const f = $('button', s); f && f.focus({preventScroll: true}); }, 40);
}
export function closeSheets(){
  $$('[data-sheet]').forEach(s => { s.hidden = true; });
  if (lastFocus && lastFocus.focus) lastFocus.focus({preventScroll: true});
}
export const sheetOpen = () => $$('[data-sheet]').some(s => !s.hidden);
let confirmFn = null;
export function confirmSheet(title, text, yes, fn){
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yes;
  confirmFn = fn;
  openSheet('sheet-confirm');
}
export function runConfirm(){ const f = confirmFn; confirmFn = null; closeSheets(); if (f) f(); }
let toastTimer = 0;
export function toast(text, ms = 3200){
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
export async function copyText(text, btn, done = 'Copied'){
  try { await navigator.clipboard.writeText(text); if (btn) { const old = btn.textContent; btn.textContent = done; setTimeout(() => { btn.textContent = old; }, 1800); } return true; }
  catch (e) { toast(text, 6000); return false; }
}

// ---------- Sound and touch ----------
let ac = null;
export function audio(){
  if (!prefs.sound) return null;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch (e) { return null; }
}
function tone(freq, dur, type = 'triangle', gain = .07, when = 0){
  const a = audio(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .03);
}
function swish(){
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * .12), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = .8; g.gain.value = .22;
  src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start();
}
export const sfx = {
  pick: () => tone(880, .06, 'sine', .05),
  tick: i => tone(i < 3 ? 520 : 780, i < 3 ? .09 : .14, 'triangle', i < 3 ? .07 : .09),
  flip: swish,
  win: () => { tone(660, .14); tone(990, .24, 'triangle', .07, .1); },
  lose: () => { tone(330, .16, 'sine', .06); tone(247, .26, 'sine', .05, .11); },
  even: () => { tone(494, .1, 'triangle', .05); tone(494, .14, 'triangle', .05, .14); },
  join: () => { tone(587, .08, 'sine', .05); tone(880, .12, 'sine', .05, .08); },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, 'triangle', .07, i * .1))
};
export function buzz(ms){ try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ---------- The table ----------
const GRID = {2: [1, 2], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [4, 2], 8: [4, 2]};
export const seatEl = id => $$('#seats .seat').find(s => s.dataset.id === String(id));
const meOf = M => M.seats.find(p => isYou(p)) || M.seats.find(p => p.type === 'person') || M.seats[0];

export function buildTable(M){
  const seats = $('#seats'), band = $('#band'), n = M.seats.length, duel = n === 2;
  seats.innerHTML = '';
  seats.className = 'seats' + (duel ? ' duel' : '');
  seats.style.setProperty('--cols', GRID[n][0]);
  seats.style.setProperty('--rows', GRID[n][1]);
  let order = M.seats;
  if (duel) { const me = meOf(M); order = [M.seats.find(p => p !== me), me]; }
  order.forEach((p, idx) => {
    const s = document.createElement('div');
    s.className = 'seat'; s.dataset.id = p.id; s.style.setProperty('--seat', p.color);
    s.innerHTML = `<div class="card is-empty"><div class="slot"><span></span></div><div class="inner"><div class="back">${BACK}</div><div class="face"></div></div><span class="badge" hidden></span></div>
      <div class="meta"><span class="who">${avatarHTML(p.type, p.real || p.name, p.color, true)}<span class="nm">${esc(p.name)}</span></span><span class="sc"></span></div>`;
    seats.append(s);
    if (duel && idx === 0) seats.append(band);
  });
  if (!duel) $('#table').insertBefore(band, $('#chant'));
}
export function resetCards(M, deal){
  const seats = $('#seats');
  seats.classList.add('no-flip');
  $$('.card', seats).forEach(c => c.classList.remove('is-up', 'is-win', 'is-lose', 'deal'));
  $$('.badge', seats).forEach(b => { b.hidden = true; });
  void seats.offsetWidth;
  seats.classList.remove('no-flip');
  if (deal) activeSeats(M).forEach(p => { const c = $('.card', seatEl(p.id)); void c.offsetWidth; c.classList.add('deal'); });
}
export function renderSeats(M, flipOnly){
  const act = new Set(activeSeats(M).map(p => p.id)), res = M.revealed ? M.result : null;
  let topGain = 0;
  if (res && res.kind === 'points') topGain = Math.max(...res.played.map(id => res.gains[id]));
  for (const p of M.seats) {
    const s = seatEl(p.id);
    if (!s) continue;
    const card = $('.card', s), face = $('.face', card), badge = $('.badge', card);
    const inPlay = act.has(p.id) || (res && res.played.includes(p.id));
    const picked = M.picks[p.id] !== undefined;
    const shown = !!res && res.played.includes(p.id);
    const m = shown ? res.picks[p.id] : null;
    if (shown && face.dataset.m !== String(m)) { face.innerHTML = faceHTML(m); face.dataset.m = m; }
    card.classList.toggle('is-empty', inPlay && !picked && !shown);
    card.classList.toggle('is-up', shown);
    card.classList.toggle('is-turn', M.phase === 'pick' && M.queue[0] === p.id);
    $('.slot span', card).textContent = M.slotText ? M.slotText(p) : (p.type === 'person' ? (M.phase === 'pick' && M.queue[0] === p.id ? 'Picking' : 'Waiting') : '');
    s.classList.toggle('is-out', !inPlay);
    if (flipOnly) continue;
    let win = false, lose = false, b = '';
    if (shown) {
      if (res.kind === 'win') { win = res.winners.includes(p.id); lose = res.losers.includes(p.id); if (win) b = '+1'; }
      else if (res.kind === 'points') { const g = res.gains[p.id]; win = g > 0 && g === topGain; lose = g === 0 && topGain > 0; if (g) b = '+' + g; }
      else if (res.kind === 'ko') { win = res.winners.includes(p.id); lose = res.outs.includes(p.id); if (lose) b = 'Out'; }
    }
    card.classList.toggle('is-win', win);
    card.classList.toggle('is-lose', lose);
    if (b && (badge.textContent !== b || badge.hidden)) {
      badge.textContent = b; badge.hidden = false; badge.classList.toggle('out', b === 'Out');
      badge.style.animation = 'none'; void badge.offsetWidth; badge.style.animation = '';
    }
    if (!b) badge.hidden = true;
    renderScore(M, p, s);
  }
}
function renderScore(M, p, s){
  const sc = $('.sc', s);
  let html = '';
  if (M.mode === 'duel') html = `<span class="pips" aria-label="${p.score} of ${M.target} wins">${Array.from({length: M.target}, (_, i) => `<span class="pip${i < p.score ? ' on' : ''}"></span>`).join('')}</span>`;
  else if (M.mode === 'points') html = `<b aria-label="${p.score} points">${p.score}</b>`;
  else if (p.out) html = '<span class="outtag">Out</span>';
  if (p.left) html = '<span class="outtag">Left</span>';
  if (sc.dataset.v !== html) {
    const old = sc.dataset.v; sc.innerHTML = html; sc.dataset.v = html;
    const b = $('b', sc); if (b && old) b.classList.add('bump');
  }
}
export function roundLabel(M){
  if (M.throwoff && M.round >= M.throwoffFrom) return 'Throw-off';
  if (M.mode === 'points') return `Round ${M.round} of ${M.totalRounds}`;
  return `Round ${M.round}`;
}
export function renderTop(M){
  $('#round-title').textContent = roundLabel(M);
  let sub;
  if (M.mode === 'duel') sub = M.bestOf === 1 ? 'One throw decides it' : `Best of ${M.bestOf}, first to ${M.target}`;
  else if (M.throwoff && M.round >= M.throwoffFrom) sub = 'Tied at the top. Last one standing wins';
  else if (M.mode === 'points') sub = '1 point for each player you beat';
  else sub = `${M.seats.filter(p => !p.out && !p.left).length} left. Last one standing wins`;
  $('#round-sub').textContent = sub;
  renderSoundButton();
}
export function renderSoundButton(){
  const b = $('#btn-sound');
  b.innerHTML = prefs.sound ? ICON.soundOn : ICON.soundOff;
  b.setAttribute('aria-pressed', prefs.sound);
  b.setAttribute('aria-label', prefs.sound ? 'Sound is on' : 'Sound is off');
}
const nameOf = (M, id) => M.seats.find(p => p.id === id).name;
const names = (M, ids) => namesList(ids.map(id => nameOf(M, id)));
export function describe(M, res){
  const P = id => M.seats.find(p => p.id === id);
  if (res.kind === 'win') { const w = P(res.winners[0]), l = P(res.losers[0]); return {head: isYou(w) ? 'You win' : `${w.name} wins`, chips: [verbOf(res.picks[w.id], res.picks[l.id])]}; }
  if (res.kind === 'draw') return {head: 'Draw', chips: [`Both threw ${lc(res.present[0])}`]};
  if (res.kind === 'points') {
    if (res.present.length === 1) return {head: 'No points', chips: [`Everyone threw ${lc(res.present[0])}`]};
    const g = Math.max(...res.played.map(id => res.gains[id])), top = res.played.filter(id => res.gains[id] === g);
    return {head: top.length <= 2 ? `${names(M, top)} +${g}` : `${top.length} players +${g}`, chips: res.verbs};
  }
  if (res.kind === 'ko') {
    const outs = res.outs.map(P);
    return {head: outs.length === 1 ? (isYou(outs[0]) ? 'You’re out' : `${outs[0].name} is out`) : `${outs.length} out`, chips: res.verbs};
  }
  return {head: 'Throw again', chips: [res.present.length === 1 ? `Everyone threw ${lc(res.present[0])}` : 'All three shapes showed']};
}
// opts.wait: what to say before the reveal; opts.note: extra HTML under the result.
export function renderBand(M, opts = {}){
  const band = $('#band');
  if (!M.revealed) {
    const lead = M.throwoff && M.round === M.throwoffFrom ? `<p class="note center">Throw-off between ${esc(names(M, M.throwoff))}</p>` : '';
    band.innerHTML = `${lead}<span class="wait">${ICON.lock}<span>${esc(opts.wait || '')}</span></span>`;
    return;
  }
  const res = M.result, d = describe(M, res);
  let note = opts.note || '';
  if (res.throwoff) note += `<p class="note center"><b>Tied at the top.</b> ${esc(names(M, res.throwoff))} go to a throw-off.</p>`;
  if (res.sat && res.sat.length) note += `<p class="note center">${esc(names(M, res.sat))} sat this one out.</p>`;
  band.innerHTML = `<h3 class="headline">${esc(d.head)}</h3><div class="verbs">${d.chips.map(c => `<span class="verb">${esc(c)}</span>`).join('')}</div>${note}`;
}
export function picksHTML(enabled, chosen = null){
  return `<div class="picks${chosen != null ? ' has-chosen' : ''}">${SHAPES.map((s, m) => `<button type="button" class="pick${chosen === m ? ' chosen' : ''}" data-pick="${m}" ${enabled ? '' : 'disabled'} aria-pressed="${chosen === m}" aria-label="Throw ${s.toLowerCase()} (key ${m + 1})"><kbd>${m + 1}</kbd>${artSVG(m)}<span class="pname">${s}</span></button>`).join('')}</div>`;
}
export function trayHead(title, aside = ''){
  return `<div class="tray-head"><h3 class="tray-title">${esc(title)}</h3>${aside ? `<span class="tray-aside" id="tray-aside">${esc(aside)}</span>` : ''}</div>`;
}
export function chantWord(w, last){
  const c = $('#chant'); c.hidden = false; $('#table').classList.add('chanting');
  c.innerHTML = `<span class="cw${last ? ' last' : ''}">${w}</span>`;
}
export function hideChant(){ $('#chant').hidden = true; $('#table').classList.remove('chanting'); }
export function bob(){
  $$('#seats .card').forEach(c => { if (c.classList.contains('is-empty')) return; c.classList.remove('bob', 'deal'); void c.offsetWidth; c.classList.add('bob'); });
}
// The chant, then every card flips at once. isLive() says whether this reveal still matters.
export async function chantAndFlip(isLive){
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (prefs.chant && !reduceMotion.matches) {
    const words = ['Stone', 'Paper', 'Scissors', 'Shoot!'];
    for (let i = 0; i < words.length; i++) {
      chantWord(words[i], i === 3); bob(); sfx.tick(i); buzz(i === 3 ? 18 : 8);
      await wait(i === 3 ? 200 : 240);
      if (!isLive()) { hideChant(); return false; }
    }
  }
  hideChant();
  return true;
}
export function outcomeSound(M){
  const r = M.result, me = M.seats.filter(p => p.type === 'person');
  if (r.kind === 'draw' || r.kind === 'again' || (r.kind === 'points' && r.present.length === 1)) return sfx.even();
  const you = M.seats.find(p => isYou(p)) || (me.length === 1 ? me[0] : null);
  if (you && r.played.includes(you.id)) {
    const id = you.id;
    const good = r.kind === 'win' ? r.winners.includes(id) : r.kind === 'ko' ? !r.outs.includes(id) : r.gains[id] > 0;
    return good ? sfx.win() : sfx.lose();
  }
  sfx.win();
}
export function announce(M){
  const r = M.result, d = describe(M, r);
  const throws = r.played.map(id => `${nameOf(M, id)} threw ${lc(r.picks[id])}`).join('. ');
  $('#live').textContent = `${throws}. ${d.chips.join('. ')}. ${d.head}.`;
}

// ---------- End of a match ----------
export function findingsFor(p, reads, seats){
  const Mv = p.moves || [], R = p.results || [], T = Mv.length, c = [0, 0, 0];
  Mv.forEach(m => c[m]++);
  const pct = c.map(x => T ? Math.round(100 * x / T) : 0);
  const You = isYou(p) ? 'You' : p.name, you = isYou(p) ? 'you' : p.name;
  const lines = [];
  if (T < 4) lines.push({w: 0, t: `${T === 1 ? 'One throw isn’t' : (T || 'No') + ' throws aren’t'} enough to show a habit. Play a longer match to see one.`});
  else {
    const fav = c.indexOf(Math.max(...c)), fs = c[fav] / T;
    if (fs >= .45) lines.push({w: fs, t: `${You} threw ${lc(fav)} ${pct[fav]}% of the time. A sharp player leans on ${lc((fav + 1) % 3)} against that.`});
    let wins = 0, stays = 0, losses = 0, ups = 0;
    for (let i = 0; i < T - 1; i++) {
      if (R[i] > 0) { wins++; if (Mv[i + 1] === Mv[i]) stays++; }
      if (R[i] < 0) { losses++; if (Mv[i + 1] === (Mv[i] + 1) % 3) ups++; }
    }
    if (wins >= 3 && stays / wins >= .6) lines.push({w: stays / wins, t: `After a win, ${you} kept the same shape ${stays} of ${wins} times.`});
    else if (wins >= 3 && stays === 0) lines.push({w: .5, t: `After a win, ${you} always changed shape.`});
    if (losses >= 3 && ups / losses >= .6) lines.push({w: ups / losses, t: `After a loss, ${you} moved on to the shape that beats ${isYou(p) ? 'your' : 'the'} last one ${ups} of ${losses} times.`});
    if (!lines.length) lines.push({w: 0, t: Math.max(...pct) <= 42 ? `${You} spread the throws well: stone ${pct[0]}%, paper ${pct[1]}%, scissors ${pct[2]}%. That’s close to the unbeatable plan.` : 'No strong habit showed up this match.'});
  }
  const out = lines.sort((a, b) => b.w - a.w).slice(0, 2).map(l => l.t);
  if (reads) {
    let best = null;
    for (const b of seats) if (b.type === 'bot') { const r = reads[b.id + '>' + p.id]; if (r && r.n >= 3 && (!best || r.n > best.r.n)) best = {b, r}; }
    if (best) out.push(`${best.b.name} called ${isYou(p) ? 'your' : p.name + '’s'} next throw ${best.r.hit} of ${best.r.n} times. Chance would get about ${Math.round(best.r.n / 3)}.`);
  }
  return {pct, lines: out};
}
export function summaryText(M, order){
  const w = M.seats.find(p => p.id === M.winner);
  if (M.mode === 'duel') return `Stone Paper Scissors (${M.bestOf === 1 ? 'one throw' : 'best of ' + M.bestOf}): ${order.map(p => `${p.name} ${p.score}`).join(', ')}.`;
  if (M.mode === 'points') return `Stone Paper Scissors (${M.totalRounds} rounds, ${M.seats.length} players): ${order.map(p => `${p.name} ${p.score}`).join(', ')}.${M.throwoff ? ` ${w.name} won the throw-off.` : ''}`;
  return `Stone Paper Scissors (knockout, ${M.seats.length} players): ${w ? w.name + ' was the last one standing' : 'nobody was left'} after ${M.round} rounds.`;
}
// opts: {order, subjects, reads, level, celebrate, findsTitle, actionsHTML}
export function renderEnd(M, opts){
  const w = M.seats.find(p => p.id === M.winner);
  $('#end-title').textContent = !w ? 'Match over' : isYou(w) ? 'You win' : `${w.name} wins`;
  let sticker, sub;
  if (M.mode === 'duel') {
    const l = M.seats.find(p => p !== w);
    sticker = w && l ? `${w.score}–${l.score}` : 'Match over';
    sub = l && l.left ? `${l.name} left the match.` : M.bestOf === 1 ? 'One throw decided it.' : `Best of ${M.bestOf}, over ${M.round} rounds including draws.`;
  } else if (M.mode === 'points') {
    sticker = w ? `${w.score} points` : 'Match over';
    sub = M.throwoff ? `Tied after ${M.totalRounds} rounds, then won the throw-off.` : `Most points after ${M.totalRounds} rounds.`;
    if (w && M.round < M.totalRounds) sub = 'Everyone else left the match.';
  } else { sticker = 'Last one standing'; sub = `Outlasted ${M.seats.length - 1} players in ${M.round} rounds.`; }
  if (opts.lostToBot) sub += ' Rematch?';
  $('#end-sticker').textContent = sticker;
  $('#end-sub').textContent = sub;
  const finalThrow = w && w.moves.length ? w.moves[w.moves.length - 1] : null;
  $('#end-cards').innerHTML = finalThrow != null ? `${cardHTML(finalThrow)}<figcaption>Final throw: ${lc(finalThrow)}</figcaption>` : '';
  $('#standings').innerHTML = opts.order.map((p, i) => {
    let detail, val;
    if (M.mode === 'duel') { detail = `${p.score} ${p.score === 1 ? 'win' : 'wins'}`; val = p.score; }
    else if (M.mode === 'points') { detail = p.id === M.winner && M.throwoff ? 'Won the throw-off' : `${p.moves.length} throws`; val = p.score; }
    else { detail = p.id === M.winner ? 'Last one standing' : `Out in round ${p.outRound}`; val = ''; }
    if (p.left) detail = 'Left the match';
    const lvl = p.type === 'bot' && opts.level ? ` · ${opts.level[0].toUpperCase() + opts.level.slice(1)} bot` : '';
    return `<li class="srow"><span class="rank">${i + 1}</span>${avatarHTML(p.type, p.real || p.name, p.color)}<span class="sname">${esc(p.name)}<small>${esc(detail)}${lvl}</small></span><span class="sval">${val}</span></li>`;
  }).join('');
  $('#finds-title').textContent = opts.findsTitle;
  $('#finds').className = 'finds' + (opts.subjects.length > 1 ? ' two' : '');
  $('#finds').innerHTML = opts.subjects.map(p => {
    const f = findingsFor(p, opts.reads, M.seats);
    return `<article class="find"><header>${avatarHTML(p.type, p.real || p.name, p.color, true)}<span>${esc(p.name)}</span></header>
      <div class="split" role="img" aria-label="Stone ${f.pct[0]}%, paper ${f.pct[1]}%, scissors ${f.pct[2]}%">${f.pct.map((x, m) => x ? `<span class="s${m}" style="flex:${x}"></span>` : '').join('')}</div>
      <div class="legend">${f.pct.map((x, m) => `<span><i class="s${m}"></i>${SHAPES[m]} ${x}%</span>`).join('')}</div>
      <ul>${f.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></article>`;
  }).join('');
  $('#copybox').hidden = true;
  $('#btn-copy').textContent = 'Copy the result';
  $('#end-actions').innerHTML = opts.actionsHTML;
  $('#end-actions').classList.toggle('single', !!opts.single);
  paintIcons($('#end-actions'));
  if (screen !== 'end') { show('end'); window.scrollTo(0, 0); }
  else if (!opts.keepScroll) window.scrollTo(0, 0);
  if (opts.celebrate && w) { sfx.fanfare(); confetti([w.color, '#c8ff00', '#ffffff', '#137eff', '#d54141']); }
  else if (opts.lostToBot) sfx.lose();
}

// ---------- Confetti ----------
let confettiRun = 0;
export function confetti(colors){
  if (reduceMotion.matches) return;
  const run = ++confettiRun;
  const c = $('#confetti'), ctx = c.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr; c.hidden = false; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = Array.from({length: 130}, () => ({
    x: W / 2 + (rnd() - .5) * W * .4, y: H * .3 + (rnd() - .5) * 40, vx: (rnd() - .5) * 11, vy: -rnd() * 12 - 5,
    w: 6 + rnd() * 6, h: 9 + rnd() * 9, r: rnd() * 6.3, vr: (rnd() - .5) * .35, col: colors[rint(colors.length)]
  }));
  const t0 = performance.now(); let last = t0;
  (function frame(t){
    const dt = Math.min(34, t - last) / 16.67; last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += .32 * dt; p.vx *= .992; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.3))); ctx.restore();
    }
    if (t - t0 < 2800 && run === confettiRun) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, W, H); c.hidden = true; }
  })(t0);
}

// ---------- The rules diagram ----------
export function drawCycle(){
  const pos = [[170, 78], [282, 232], [58, 232]];   // stone, scissors, paper: stone blunts scissors, scissors cut paper, paper wraps stone
  const ids = [0, 2, 1];
  const disc = (m, [x, y]) => `<circle class="disc" cx="${x}" cy="${y}" r="46"/><svg x="${x - 38}" y="${y - 38}" width="76" height="76" viewBox="0 0 120 120">${ART[m]}</svg><text class="lbl" x="${x}" y="${y + (y < 100 ? -54 : 64)}" text-anchor="middle">${SHAPES[m]}</text>`;
  const arc = (a, b, label, lx, ly) => `<path class="arc" d="M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2 + (b[1] - a[1]) * .18} ${(a[1] + b[1]) / 2 - (b[0] - a[0]) * .18} ${b[0]} ${b[1]}" fill="none" stroke-width="2.2" marker-end="url(#ah)"/><text class="lbl" x="${lx}" y="${ly}" text-anchor="middle">${label}</text>`;
  const along = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const seg = (i, j, label, lx, ly) => arc(along(pos[i], pos[j], .3), along(pos[i], pos[j], .7), label, lx, ly);
  $('#cycle').innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor" opacity=".7"/></marker></defs>
    ${seg(0, 1, 'blunts', 262, 138)}${seg(1, 2, 'cut', 170, 282)}${seg(2, 0, 'wraps', 76, 138)}
    ${ids.map((m, i) => disc(m, pos[i])).join('')}`;
}
