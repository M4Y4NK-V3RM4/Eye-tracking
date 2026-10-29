// Reverse Snakes & Ladders: the board, the pieces, two 3D dice, and the turn as it plays out on screen.
// Play against bots on this phone, or online (online.js passes the server's state in).
import { SNAKES, LADDERS, START, TIMING, cellXY, createSnakes, playSnakes, nextSnakes, activeSnakes, standingsSnakes } from '/shared/snakes.js';
import { botChoose, LEVELS } from '/shared/bots.js';
import { SHAPES, lc, rnd, rint } from '/shared/rules.js';
import { namesList, isYou } from '/shared/words.js';
import { prefs, savePrefs } from './prefs.js';
import * as ui from './ui.js';
const { $, $$, esc } = ui;

const SEAT_COLORS = ['#137eff', '#d54141', '#1a8f4a', '#c46a00', '#7a4fd6', '#0b7f86'];
const BOT_NAMES = ['Laddoo', 'Jalebi', 'Barfi', 'Kaju', 'Peda'];
// Each snake's body and colour, traced from the photo of the classic board: points between the head
// and the tail, in the board's 1000 x 1100 space. The head and the tail tip sit on their squares' centres.
const SNAKE_ART = {
  98: {c: ['#2f9e57', '#1b6b38'], via: [[313, 82], [359, 152], [377, 240], [380, 333], [389, 421], [423, 491], [469, 553], [512, 612], [545, 678], [562, 749], [585, 813]]},
  94: {c: ['#e07b1f', '#a3520c'], via: [[634, 76], [620, 129], [610, 187], [616, 246], [634, 304], [644, 357], [635, 404], [600, 427]]},
  88: {c: ['#137eff', '#0b54c2'], via: [[786, 158], [800, 216], [806, 287], [832, 347], [881, 394], [915, 444], [927, 503], [920, 561], [899, 608]]},
  82: {c: ['#7a4fd6', '#4f2fa1'], via: [[165, 181], [183, 228], [209, 275], [225, 324], [225, 371], [213, 418], [218, 464], [248, 497], [292, 520], [330, 540]]},
  78: {c: ['#d54141', '#962626'], via: [[284, 283], [301, 324], [313, 371], [312, 418], [294, 462], [257, 491], [229, 523], [227, 570], [236, 616], [229, 663], [205, 698]]},
  68: {c: ['#ef6a4f', '#b2412b'], via: [[707, 415], [685, 464], [667, 520], [662, 579], [666, 637], [658, 696], [628, 743], [577, 766], [510, 785], [452, 815], [394, 850], [334, 895]]},
  66: {c: ['#0b8f8f', '#06605f'], via: [[496, 368], [470, 394], [460, 441], [477, 485], [512, 520], [547, 556], [579, 593], [591, 632]]},
  59: {c: ['#8a5a3c', '#5c3a24'], via: [[127, 488], [111, 523], [100, 570], [98, 628], [93, 696], [88, 754], [100, 801], [123, 832]]},
  49: {c: ['#c43a7d', '#8a2155'], via: [[811, 581], [783, 616], [766, 663], [771, 722], [795, 768], [823, 815], [844, 862], [846, 909]]},
  37: {c: ['#9e2a3a', '#6b1724'], via: [[406, 708], [440, 733], [475, 768], [504, 815], [533, 860], [568, 897], [614, 923], [672, 930], [718, 918], [744, 892]]},
  30: {c: ['#2f4fa8', '#1d3270'], via: [[892, 731], [837, 740], [790, 754], [756, 780], [738, 820], [756, 860], [800, 883], [817, 918], [800, 953], [753, 977], [684, 988], [605, 988]]}
};
const SPARE_COLORS = [['#6f9e1a', '#4a6b0d'], ['#c46a00', '#8a4a00']];
const f1 = v => Math.round(v * 10) / 10;
// A smooth curve through the points (Catmull-Rom), as cubic Bezier segments [p0, c1, c2, p1].
function curve(pts){
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
    segs.push([b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c]);
  }
  return segs;
}
const bez = ([p, c1, c2, q], t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * p[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * q[k]); };
// A snake: a body that tapers to its tail, a head with eyes and a tongue, and the line a piece slides along.
function snakeSVG(head, tail, i){
  const art = SNAKE_ART[head], [hx, hy] = cellXY(head), [tx, ty] = cellXY(tail);
  const via = art ? art.via : [[(hx + tx) / 2 + (ty - hy) * .15, (hy + ty) / 2 - (tx - hx) * .15]];
  const [body, edge] = art ? art.c : SPARE_COLORS[i % SPARE_COLORS.length];
  const segs = curve([[hx, hy], ...via, [tx, ty]]);
  const d = `M${hx} ${hy}` + segs.map(([, a, b, q]) => `C${f1(a[0])} ${f1(a[1])} ${f1(b[0])} ${f1(b[1])} ${q[0]} ${q[1]}`).join('');
  const pts = [[hx, hy]];
  for (const sg of segs) for (let k = 1; k <= 14; k++) pts.push(bez(sg, k / 14));
  const at = [0];
  for (let k = 1; k < pts.length; k++) at.push(at[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = at[at.length - 1], left = [], right = [];
  pts.forEach((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l, t = at[k] / total;
    const w = 2.5 + 12.5 * (t < .45 ? 1 : 1 - ((t - .45) / .55) ** 1.5);
    left.push(`${f1(p[0] + nx * w)},${f1(p[1] + ny * w)}`); right.unshift(`${f1(p[0] - nx * w)},${f1(p[1] - ny * w)}`);
  });
  const spots = pts.filter((p, k) => at[k] / total < .8).map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
  // the head looks away from the body, along the first stretch of it
  const [qx, qy] = via[0], ql = Math.hypot(qx - hx, qy - hy) || 1, fx = (hx - qx) / ql, fy = (hy - qy) / ql;
  const ang = Math.atan2(fy, fx) * 180 / Math.PI, ox = -fy * 8, oy = fx * 8, ex = hx + fx * 7, ey = hy + fy * 7;
  const tip = [hx + fx * 34, hy + fy * 34];
  return `<g class="snake">
      <polygon points="${left.join(' ')} ${right.join(' ')}" fill="${body}" stroke="${edge}" stroke-width="3.5" stroke-linejoin="round"/>
      <polyline class="spots" points="${spots}" stroke-width="6" stroke-dasharray="0.1 19"/>
      <path class="tongue" d="M${f1(hx + fx * 20)} ${f1(hy + fy * 20)}L${f1(tip[0])} ${f1(tip[1])}M${f1(tip[0])} ${f1(tip[1])}l${f1(fx * 7 + ox * .6)} ${f1(fy * 7 + oy * .6)}M${f1(tip[0])} ${f1(tip[1])}l${f1(fx * 7 - ox * .6)} ${f1(fy * 7 - oy * .6)}"/>
      <ellipse cx="${hx}" cy="${hy}" rx="24" ry="19" transform="rotate(${f1(ang)} ${hx} ${hy})" fill="${body}" stroke="${edge}" stroke-width="3.5"/>
      <circle cx="${f1(ex + ox)}" cy="${f1(ey + oy)}" r="5.5" fill="#fff"/><circle cx="${f1(ex - ox)}" cy="${f1(ey - oy)}" r="5.5" fill="#fff"/>
      <circle cx="${f1(ex + ox + fx * 1.5)}" cy="${f1(ey + oy + fy * 1.5)}" r="2.8" fill="#141414"/><circle cx="${f1(ex - ox + fx * 1.5)}" cy="${f1(ey - oy + fy * 1.5)}" r="2.8" fill="#141414"/>
      <path id="jump-${head}" d="${d}" fill="none" stroke="none"/></g>`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const quick = () => ui.reduceMotion.matches;

// ---------- The board ----------
let built = false;
const paths = new Map();   // start square of a snake or ladder -> its SVG path, for sliding along it
function buildBoard(){
  if (built) return;
  built = true;
  let cells = '';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const row = 9 - r, n = row * 10 + (row % 2 === 0 ? c + 1 : 10 - c);
    cells += `<div class="sl-cell${(r + c) % 2 ? ' alt' : ''}${n === START ? ' start' : ''}"><span>${n}</span></div>`;
  }
  $('#sl-grid').innerHTML = cells;
  let art = '';
  for (const [foot, top] of LADDERS) {
    const [x1, y1] = cellXY(foot), [x2, y2] = cellXY(top);
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy * 19, ny = ux * 19;
    let rungs = '';
    for (let d = 34; d < len - 20; d += 48) rungs += `<line x1="${x1 + ux * d + nx}" y1="${y1 + uy * d + ny}" x2="${x1 + ux * d - nx}" y2="${y1 + uy * d - ny}"/>`;
    art += `<g class="ladder"><g class="rungs">${rungs}</g>
      <line class="rail" x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}"/><line class="rail" x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}"/>
      <path id="jump-${foot}" d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="none"/></g>`;
  }
  SNAKES.forEach(([head, tail], i) => { art += snakeSVG(head, tail, i); });
  $('#sl-art').innerHTML = art;
  for (const [a] of [...SNAKES, ...LADDERS]) paths.set(a, document.getElementById('jump-' + a));
  $('#sl-dice').innerHTML = [0, 1].map(() => `<div class="die"><div class="shadow"></div><div class="cube">${dieFaces()}</div></div>`).join('');
}

// ---------- Pieces ----------
const toPct = ([x, y]) => [x / 10, y / 11];
const tokenOf = id => $$('#sl-tokens .sl-token').find(t => t.dataset.id === String(id));
const OFFSETS = {1: [[0, 0]], 2: [[-17, 0], [17, 0]], 3: [[-17, -12], [17, -12], [0, 15]], 4: [[-17, -14], [17, -14], [-17, 14], [17, 14]],
  5: [[-23, -14], [0, -14], [23, -14], [-12, 14], [12, 14]], 6: [[-23, -14], [0, -14], [23, -14], [-23, 14], [0, 14], [23, 14]]};
function buildTokens(seats, me){
  $('#sl-tokens').innerHTML = seats.map(s => `<div class="sl-token${s.id === me ? ' me' : ''}" data-id="${esc(s.id)}" style="--seat:${s.color}" aria-hidden="true">${esc(ui.initial(s.real || s.name))}</div>`).join('');
}
function setXY(el, xy){ const [l, t] = toPct(xy); el.style.left = l + '%'; el.style.top = t + '%'; }
// Put every piece on its square; pieces sharing a square sit side by side.
function placeAll(seats){
  const at = new Map();
  for (const s of seats) { if (s.left) continue; (at.get(s.pos) || at.set(s.pos, []).get(s.pos)).push(s); }
  for (const s of seats) { const t = tokenOf(s.id); if (t) t.hidden = !!s.left; }
  for (const [pos, list] of at) {
    const [x, y] = cellXY(pos), offs = OFFSETS[Math.min(6, list.length)];
    list.forEach((s, i) => { const t = tokenOf(s.id); if (t) setXY(t, [x + offs[i][0], y + offs[i][1]]); });
  }
}
async function walk(id, from, landed){
  const t = tokenOf(id);
  if (!t) return;
  t.classList.add('moving');
  t.style.setProperty('--step', TIMING.step + 'ms');
  for (let n = from - 1; n >= landed; n--) {
    setXY(t, cellXY(n));
    t.classList.remove('hop'); void t.offsetWidth; t.classList.add('hop');
    if (n % 2 === 0) ui.sfx.pick();
    await sleep(TIMING.step);
  }
  t.classList.remove('hop', 'moving');
}
async function slide(id, start){
  const t = tokenOf(id), path = paths.get(start);
  if (!t || !path) return;
  t.classList.add('moving', 'sliding');
  const len = path.getTotalLength(), t0 = performance.now(), dur = quick() ? 1 : TIMING.slide;
  await new Promise(done => {
    (function frame(now){
      const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = path.getPointAtLength(e * len);
      setXY(t, [p.x, p.y]);
      if (k < 1) requestAnimationFrame(frame); else done();
    })(t0);
  });
  t.classList.remove('moving', 'sliding');
}

// ---------- Dice ----------
const PIPS = {1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]]};
const FACE = {1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)'};
const SHOW = {1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0]};   // cube rotation (X, Y) that faces v to the front
function dieFaces(){
  let s = '';
  for (let v = 1; v <= 6; v++) s += `<div class="c" data-face="${v}"></div>`;
  for (let v = 1; v <= 6; v++) s += `<div class="f v${v}" data-face="${v}">${PIPS[v].map(([r, c]) => `<i class="p" style="grid-area:${r}/${c}"></i>`).join('')}</div>`;
  return s;
}
function sizeDie(die){
  const h = die.offsetWidth / 2;
  $$('.f, .c', die).forEach(f => { f.style.transform = `${FACE[f.dataset.face]} translateZ(${f.classList.contains('c') ? h - 1 : h}px)`; });
}
async function rollDice(values, color){
  const layer = $('#sl-dice'), dice = $$('.die', layer), W = layer.clientWidth, H = layer.clientHeight;
  const spots = [[31 + rnd() * 6, 38 + rnd() * 6], [52 + rnd() * 6, 42 + rnd() * 6]];
  ui.sfx.flip();
  await Promise.all(dice.map((die, i) => {
    die.getAnimations().forEach(a => a.cancel());
    die.style.left = spots[i][0] + '%'; die.style.top = spots[i][1] + '%';
    die.style.opacity = '1';
    sizeDie(die);
    const cube = $('.cube', die), shadow = $('.shadow', die), [ex, ey] = SHOW[values[i]], z = (rnd() * 36 - 18) | 0;
    const dir = i ? 1 : -1, dur = quick() ? 1 : TIMING.dice, delay = quick() ? 0 : i * 70;
    const fx = W * (.55 + i * .08), fy = H * .55, lift = die.offsetWidth * 2.2;
    const end = `rotateZ(${z}deg) rotateX(${ex}deg) rotateY(${ey}deg)`;
    const start = `rotateZ(${z + 160 * dir}deg) rotateX(${ex - 720 - rint(2) * 180}deg) rotateY(${ey + 540 * dir}deg)`;
    cube.animate([{transform: start}, {transform: end}], {duration: dur * .86, delay, easing: 'cubic-bezier(.15,.7,.22,1)', fill: 'both'});
    shadow.animate([{opacity: 0, transform: 'scale(.3)'}, {opacity: .18, transform: 'scale(.6)', offset: .3}, {opacity: .42, transform: 'scale(1)', offset: .58},
      {opacity: .25, transform: 'scale(.8)', offset: .72}, {opacity: .42, transform: 'scale(1)', offset: .86}, {opacity: .42, transform: 'scale(1)'}], {duration: dur, delay, fill: 'both'});
    return die.animate([
      {transform: `translate(${fx}px, ${fy}px) scale(1.5)`, opacity: 0},
      {transform: `translate(${fx * .5}px, ${fy * .45 - lift}px) scale(1.3)`, opacity: 1, offset: .3},
      {transform: 'translate(0px, 0px) scale(1)', offset: .58},
      {transform: `translate(${-W * .012}px, ${-lift * .28}px) scale(1.06)`, offset: .72},
      {transform: 'translate(0px, 0px) scale(1)', offset: .86},
      {transform: 'translate(0px, 0px) scale(1)'}
    ], {duration: dur, delay, easing: 'cubic-bezier(.3,.55,.45,1)', fill: 'both'}).finished.catch(() => {});
  }));
  ui.buzz(14);
}
function hideDice(){
  for (const die of $$('#sl-dice .die')) die.animate([{opacity: 1}, {opacity: 0}], {duration: 180, fill: 'forwards'});
}
function callout(html, cls = ''){
  const c = $('#sl-callout');
  c.innerHTML = `<span class="sl-pill ${cls}">${html}</span>`;
  c.hidden = false;
}
const hideCallout = () => { $('#sl-callout').hidden = true; };

// ---------- The strip of players, and the tray ----------
// ctx: {seats, me, locked, sitting, away, res (a revealed throw, or null)}
function renderStrip(ctx){
  $('#sl-strip').innerHTML = ctx.seats.filter(s => !s.left).map(s => {
    const shown = ctx.res && ctx.res.played.includes(s.id);
    const cls = ['sl-chip', s.id === ctx.me ? 'is-me' : '',
      shown ? 'show-throw' : '', shown && ctx.res.rollers.includes(s.id) ? 'is-roller' : '', shown && ctx.res.rollers.length && !ctx.res.rollers.includes(s.id) ? 'is-dim' : '',
      !ctx.res && ctx.locked && ctx.locked.includes(s.id) ? 'is-locked' : '', ctx.away && ctx.away.includes(s.id) ? 'is-away' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-id="${esc(s.id)}" style="--seat:${s.color}">
      ${ui.avatarHTML(s.type, s.real || s.name, s.color)}<span class="sl-throw">${shown ? ui.artSVG(ctx.res.picks[s.id]) : ''}</span>
      <span class="sl-nm">${esc(s.name)}</span><span class="sl-pos" data-pos="${esc(s.id)}">${s.pos === 0 ? 'Home' : s.pos}</span></div>`;
  }).join('');
}
function setPos(id, pos){ const el = $$('#sl-strip .sl-pos').find(e => e.dataset.pos === String(id)); if (el) el.textContent = pos === 0 ? 'Home' : pos; }
// What a throw means, for the tray: "Paper wraps stone · Priya rolls".
function throwWords(res, nameOf){
  if (res.kind === 'again') return {title: res.present.length === 1 ? `Everyone threw ${lc(res.present[0])}` : 'All tied', sub: 'Throw again'};
  const who = res.rollers.map(nameOf);
  return {title: who.length === 1 ? (who[0] === 'You' ? 'You roll' : `${who[0]} rolls`) : `${namesList(who)} roll`, sub: res.verbs.join(' · ')};
}

// ---------- One turn, played out ----------
// After the throws flip, each roller's dice tumble onto the board, the piece hops down square by
// square, and a snake or a ladder carries it on. Total time matches TIMING, so online phones stay in step.
async function playTurn(res, seats, me, isLive, trayTitle){
  const nameOf = id => (seats.find(s => s.id === id) || {}).name;
  renderStrip({seats, me, res});
  const w = throwWords(res, nameOf);
  trayTitle(w.title, w.sub);
  if (res.kind === 'again') { ui.sfx.even(); await sleep(quick() ? 0 : TIMING.reveal); return isLive(); }
  const cheer = me == null ? res.rollers.some(id => seats.find(s => s.id === id)?.type === 'person') : res.rollers.includes(me);
  cheer ? ui.sfx.win() : ui.sfx.tick(3);
  await sleep(quick() ? 0 : TIMING.reveal);
  for (const r of res.rolls) {
    if (!isLive()) return false;
    const s = seats.find(x => x.id === r.id);
    trayTitle(`${nameOf(r.id)} ${nameOf(r.id) === 'You' ? 'roll' : 'rolls'} ${r.total}`, `${r.dice[0]} + ${r.dice[1]}`);
    await rollDice(r.dice, s.color);
    callout(`${esc(nameOf(r.id))} · ${r.total}`, '');
    tokenOf(r.id)?.classList.add('moving');
    await walk(r.id, r.from, r.landed);
    if (!isLive()) return false;
    hideDice();
    if (r.via) {
      const good = r.via === 'snake';
      callout(`${good ? 'Snake! Slide' : 'Ladder… back up'} to ${r.to}`, good ? 'good' : 'bad');
      good ? ui.sfx.win() : ui.sfx.lose();
      await slide(r.id, r.landed);
    }
    s.pos = r.to; setPos(r.id, r.to);
    placeAll(seats);
    await sleep(quick() ? 0 : TIMING.gap);
    hideCallout();
    if (r.to === 0) { callout(`${esc(nameOf(r.id))} ${nameOf(r.id) === 'You' ? 'are' : 'is'} home!`, 'good'); break; }
  }
  return isLive();
}

// ---------- The screen ----------
function showScreen(title){
  buildBoard();
  ui.show('snakes');
  window.scrollTo(0, 0);
  $('#sl-title').textContent = title;
  ui.renderSoundButton();
}
function trayHTML(title, aside, picks, extra = ''){
  return `${ui.trayHead(title, aside)}${extra}${picks}`;
}
function setTrayTitle(title, sub){
  const h = $('#sl-tray .tray-title'), a = $('#sl-tray .tray-aside');
  if (h) h.textContent = title;
  if (a) a.textContent = sub || '';
  else if (sub && h) h.insertAdjacentHTML('afterend', `<span class="tray-aside" id="tray-aside">${esc(sub)}</span>`);
}

// ---------- On this phone: one or two people, and bots ----------
// Two people share the phone side by side and tap at the same time; bots fill the other seats.
const L = {m: null, busy: false, pending: {}, token: 0, people: []};
const SETUP_KEY = 'kheeladi-snakes-setup-v1';
const LS = (() => {
  const s = {people: 1, bots: 2, level: 'sharp', names: ['', '']};
  try { Object.assign(s, JSON.parse(localStorage.getItem(SETUP_KEY) || '{}')); } catch (e) {}
  s.people = s.people === 2 ? 2 : 1;
  s.bots = Math.min(6 - s.people, Math.max(2 - s.people, s.bots | 0));
  if (!LEVELS[s.level]) s.level = 'sharp';
  if (!Array.isArray(s.names)) s.names = ['', ''];
  return s;
})();
const saveLS = () => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(LS)); } catch (e) {} };
const personName = i => LS.people === 1 ? 'You' : (String(LS.names[i] || '').trim() || `Player ${i + 1}`);
export function renderLocalSetup(){
  const minBots = 2 - LS.people, maxBots = 6 - LS.people;
  LS.bots = Math.min(maxBots, Math.max(minBots, LS.bots));
  $$('[data-sl-people]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.slPeople === LS.people));
  $('#sl-names').hidden = LS.people === 1;
  [0, 1].forEach(i => { const el = $('#sl-name-' + i); if (document.activeElement !== el) el.value = LS.names[i] || ''; });
  $('#sl-people-hint').textContent = LS.people === 2
    ? 'You each get your own three buttons, side by side, and tap at the same time. Neither throw shows until both are in.'
    : 'Bots throw at the same moment you do, using only earlier turns.';
  $('#sl-bots-count').textContent = LS.bots;
  $('[data-act="sl-minus"]').disabled = LS.bots <= minBots;
  $('[data-act="sl-plus"]').disabled = LS.bots >= maxBots;
  const lvl = LS.level[0].toUpperCase() + LS.level.slice(1);
  $('#sl-bots-list').innerHTML = BOT_NAMES.slice(0, LS.bots).map((n, i) => `<li class="prow" style="--seat:${SEAT_COLORS[i + LS.people]}">${ui.avatarHTML('bot', n, SEAT_COLORS[i + LS.people])}<span class="rname">${n}<small>${lvl} bot</small></span><span></span></li>`).join('');
  $('#sl-level-sec').hidden = LS.bots === 0;
  $$('[data-sl-level]').forEach(b => b.setAttribute('aria-pressed', b.dataset.slLevel === LS.level));
  $('#sl-level-hint').textContent = LEVELS[LS.level];
  $('#sl-play-label').textContent = LS.people === 2
    ? (LS.bots ? `Play with ${LS.bots} ${LS.bots === 1 ? 'bot' : 'bots'}` : 'Play head to head')
    : `Play ${LS.bots} ${LS.bots === 1 ? 'bot' : 'bots'}`;
}
export function setupClick(t){
  if (t.dataset.slPeople) { LS.people = +t.dataset.slPeople; saveLS(); renderLocalSetup(); return true; }
  if (t.dataset.slLevel) { LS.level = t.dataset.slLevel; saveLS(); renderLocalSetup(); return true; }
  if (t.dataset.act === 'sl-minus') { LS.bots--; saveLS(); renderLocalSetup(); return true; }
  if (t.dataset.act === 'sl-plus') { LS.bots++; saveLS(); renderLocalSetup(); return true; }
  return false;
}
export function nameInput(t){ LS.names[+t.dataset.slName] = t.value.slice(0, 16); saveLS(); }
let mode = null;   // 'local' or 'online': who owns the snakes screen
export const isLocal = () => mode === 'local' && !!L.m;
export function playLocal(){
  mode = 'local';
  ui.audio();
  L.token++;
  const people = Array.from({length: LS.people}, (_, i) => ({id: 'p' + i, name: personName(i), type: 'person', color: SEAT_COLORS[i]}));
  if (LS.people === 1) people[0].real = prefs.name || 'You';
  const seats = people.concat(BOT_NAMES.slice(0, LS.bots).map((n, i) => ({id: 'b' + i, name: n, type: 'bot', color: SEAT_COLORS[i + LS.people]})));
  L.m = createSnakes({seats});
  L.m.seats.forEach((s, i) => { if (seats[i].real) s.real = seats[i].real; });
  L.m.level = LS.level;
  L.people = L.m.seats.filter(s => s.type === 'person');
  L.busy = false; L.pending = {};
  showScreen('Snakes & Ladders');
  $('#sl-sub').textContent = 'Race from 100 down to 0';
  buildTokens(L.m.seats, LS.people === 1 ? 'p0' : null);
  placeAll(L.m.seats);
  hideCallout();
  for (const d of $$('#sl-dice .die')) { d.getAnimations().forEach(a => a.cancel()); d.style.opacity = '0'; }
  renderStrip({seats: L.m.seats, me: LS.people === 1 ? 'p0' : null, res: null});
  localTray();
}
// The tray: one person's buttons, or two columns side by side. A pick made while a turn is still
// playing out waits for the next throw.
function localTray(){
  const locked = Object.keys(L.pending);
  const title = L.busy ? ($('#sl-tray .tray-title')?.textContent || 'Rolling') : L.m.round === 1 ? 'Throw!' : 'Throw again';
  const aside = L.busy ? ($('#sl-tray .tray-aside')?.textContent || '') : L.people.length === 2 ? 'Both tap at once' : 'Beat the bots to roll';
  if (L.people.length === 2) {
    $('#sl-tray').innerHTML = ui.trayHead(title, aside) + ui.duoHTML(L.people, locked, true);
  } else {
    $('#sl-tray').innerHTML = ui.trayHead(title, aside) + ui.picksHTML(true, L.pending.p0 ?? null);
  }
}
function localChoose(move, who){
  if (!L.m || L.m.over) return;
  const seat = who == null ? L.people[0] : L.people.find(p => p.id === who);
  if (!seat) return;
  L.pending[seat.id] = move;
  ui.sfx.pick(); ui.buzz(10);
  if (L.busy || L.people.some(p => L.pending[p.id] == null)) { localTray(); return; }
  runTurn();
}
async function runTurn(){
  L.busy = true;
  const tok = L.token, m = L.m, act = activeSnakes(m);
  const picks = {...L.pending};
  L.pending = {};
  for (const s of act) if (s.type === 'bot') picks[s.id] = botChoose(m.level, s, act).move;
  // the board shows positions from before the throw; the engine moves them now
  const before = m.seats.map(s => ({...s}));
  const me = L.people.length === 1 ? L.people[0].id : null;
  const res = playSnakes(m, picks);
  $('#sl-sub').textContent = `Turn ${m.round}`;
  localTray();
  await playTurn(res, before, me, () => tok === L.token, setTrayTitle);
  if (tok !== L.token) return;
  placeAll(m.seats);
  renderStrip({seats: m.seats, me, res});
  if (m.over) { setTimeout(() => tok === L.token && showEnd(m, me, {local: true, solo: L.people.length === 1}), quick() ? 300 : 1400); return; }
  nextSnakes(m);
  L.busy = false;
  if (L.people.every(p => L.pending[p.id] != null)) return runTurn();
  localTray();
}
export function endLocal(){ L.token++; L.m = null; L.busy = false; L.pending = {}; mode = null; hideCallout(); }

// ---------- Online ----------
// online.js calls renderOnline with each state from the server; api = {send, serverNow, isHost}.
const O = {state: null, api: null, matchId: 0, shown: 0, animating: false, anim: 0, endShown: 0, overTimer: 0, tick: 0};
const asSeats = s => s.match.seats.map(x => ({...x, real: x.name, name: x.id === s.you ? 'You' : x.name, type: 'person',
  moves: s.match.history ? s.match.history[x.id].moves : [], results: s.match.history ? s.match.history[x.id].results : []}));
export function renderOnline(s, api, fresh){
  mode = 'online';
  O.state = s; O.api = api;
  const m = s.match;
  if (fresh || m.id !== O.matchId) {
    O.matchId = m.id; O.anim++; O.animating = false; O.endShown = 0;
    clearTimeout(O.overTimer); O.overTimer = 0;
    O.shown = fresh && m.last ? m.last.round : 0;
    showScreen('Snakes & Ladders');
    const seats = asSeats(s);
    buildTokens(seats, s.you);
    placeAll(seats);
    hideCallout();
    for (const d of $$('#sl-dice .die')) { d.getAnimations().forEach(a => a.cancel()); d.style.opacity = '0'; }
    if (fresh && s.phase === 'over') return showOnlineEnd(true);
  }
  if (O.endShown === m.id) { if (ui.screen === 'end') showOnlineEnd(true); return; }
  if (ui.screen !== 'snakes') showScreen('Snakes & Ladders');
  if (O.animating) return;   // the turn under way picks up the newest state when it ends
  if (m.last && m.last.round > O.shown) return animateOnline();
  const seats = asSeats(s);
  placeAll(seats);
  renderStrip({seats, me: s.you, res: null, locked: m.locked, away: s.players.filter(p => !p.connected).map(p => p.id)});
  $('#sl-sub').textContent = `Turn ${m.round}`;
  onlineTray();
  if (s.phase === 'over' && !O.overTimer) O.overTimer = setTimeout(() => { O.overTimer = 0; if (O.state && O.state.phase === 'over') showOnlineEnd(false); }, 1200);
}
async function animateOnline(){
  O.animating = true;
  const token = ++O.anim, s = O.state, m = s.match, last = m.last;
  // pieces start where they were before this turn
  const seats = asSeats(s);
  for (const r of last.rolls) { const x = seats.find(q => q.id === r.id); if (x) x.pos = r.from; }
  placeAll(seats);
  $('#sl-sub').textContent = `Turn ${last.round}`;
  onlineTray(true);
  const live = () => token === O.anim && !!O.state;
  const done = await playTurn(last, seats, s.you, live, setTrayTitle);
  O.shown = last.round;
  O.animating = false;
  if (!done) return;
  renderOnline(O.state, O.api, false);
}
function clock(){
  const m = O.state && O.state.match;
  if (!m || !m.deadline || !m.pickMs || O.state.phase !== 'playing') return null;
  const left = m.deadline - O.api.serverNow();
  return {left, total: m.pickMs, started: left <= m.pickMs};
}
function clockText(){
  const c = clock();
  if (!c) return '';
  if (!c.started) return 'Get ready';
  const secs = Math.ceil(c.left / 1000);
  return secs > 0 ? `${secs} s` : 'Time’s up';
}
function onlineTray(keepTitle){
  const s = O.state, m = s.match, me = s.you, seat = m.seats.find(x => x.id === me);
  const player = s.players.find(p => p.id === me) || {};
  const tray = $('#sl-tray');
  const msg = (b, sub) => `<div class="tray-row"><div class="tray-msg"><b>${esc(b)}</b><span>${esc(sub)}</span></div></div>`;
  const bar = clock() ? '<div class="timebar" aria-hidden="true"><i></i></div>' : '';
  const oldTitle = $('#sl-tray .tray-title')?.textContent, oldAside = $('#sl-tray .tray-aside')?.textContent;
  let html;
  if (s.phase === 'over') html = `<button class="cta wide" type="button" data-act="sl-results"><span>See who won</span><span class="arrow">${ui.ICON.arrow}</span></button>`;
  else if (!seat || player.role === 'spectator') html = msg('Watching', 'You’ll play in the next game.');
  else if (seat.left) html = msg('You left this game', 'Join the next one from the lobby.');
  else if (m.waiting) html = msg('Waiting for players', 'Too few people are here to throw.') + (O.api.isHost() ? '<button class="btn2" type="button" data-act="o-end-ask">End the game</button>' : '');
  else {
    const title = keepTitle && oldTitle ? oldTitle : m.myPick == null ? (m.round === 1 ? 'Your throw' : 'Throw again') : m.myRandom ? 'Too slow' : 'Locked in';
    const aside = keepTitle && oldTitle ? (oldAside || '') : m.myPick == null ? clockText() : m.myRandom ? 'A random throw was made' : 'Tap another to change';
    html = trayHTML(title, aside, ui.picksHTML(true, m.myPick), bar);
  }
  tray.innerHTML = html;
  tray.dataset.ticking = m.myPick == null && !keepTitle ? '1' : '';
  runTimebar();
}
function runTimebar(){
  const bar = $('#sl-tray .timebar i'), c = clock();
  if (!bar || !c) return;
  const left = Math.max(0, c.left), run = Math.min(left, c.total), delay = Math.max(0, left - c.total);
  bar.style.transition = 'none';
  bar.style.transform = `scaleX(${run / c.total})`;
  void bar.offsetWidth;
  bar.style.transition = `transform ${run}ms linear ${delay}ms`;
  bar.style.transform = 'scaleX(0)';
}
let lastBeep = 0;
setInterval(() => {
  if (mode !== 'online' || !O.state || O.state.phase !== 'playing' || ui.screen !== 'snakes') return;
  const c = clock(), tray = $('#sl-tray');
  if (!c || !tray.dataset.ticking) return;
  const aside = $('#sl-tray .tray-aside'), t = clockText();
  if (aside && aside.textContent !== t) aside.textContent = t;
  const secs = Math.ceil(c.left / 1000);
  $('#sl-tray .timebar')?.classList.toggle('low', c.started && secs <= 2);
  if (c.started && secs > 0 && secs <= 3 && secs !== lastBeep && O.state.match.myPick == null) { lastBeep = secs; ui.sfx.tick(0); ui.buzz(6); }
}, 250);
function onlineChoose(move){
  const s = O.state;
  if (!s || s.phase !== 'playing') return;
  const m = s.match;
  if (!m.seats.some(x => x.id === s.you && !x.left) || m.myPick === move) return;
  if (!O.api.send({t: 'pick', round: m.round, move})) return;
  m.myPick = move;
  if (!m.locked.includes(s.you)) m.locked.push(s.you);
  ui.sfx.pick(); ui.buzz(10);
  if (O.animating) { $$('#sl-tray .pick').forEach(b => { b.classList.toggle('chosen', +b.dataset.pick === move); }); $('#sl-tray .picks')?.classList.add('has-chosen'); return; }
  onlineTray();
}
export function choose(move, who){ if (mode === 'online') onlineChoose(move); else localChoose(move, who); }
export function resultsOnline(){ if (O.state && O.state.phase === 'over') showOnlineEnd(false); }
function showOnlineEnd(quiet){
  clearTimeout(O.overTimer); O.overTimer = 0;
  const s = O.state, m = s.match;
  O.endShown = m.id;
  const seats = asSeats(s), host = s.players.find(p => p.id === s.host) || {name: 'the host'};
  showEnd({...m, seats}, s.you, {quiet, actionsHTML: O.api.isHost()
    ? `<button class="cta wide" type="button" data-act="o-rematch"><span>Play again</span><span class="arrow" data-icon="again"></span></button><button class="btn2" type="button" data-act="o-lobby">Lobby</button>`
    : `<p class="waitline end-wait">Waiting for ${esc(host.name)} to start the next game <span class="dots"><i></i><i></i><i></i></span></p><button class="btn2" type="button" data-act="leave-ask">Leave</button>`});
}
export function leaveOnline(){ O.anim++; O.animating = false; O.state = null; mode = null; }

// ---------- End of a game ----------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function journey(p){
  if (p.snakes && p.ladders) return `Rode ${plural(p.snakes, 'snake', 'snakes')} down and climbed ${plural(p.ladders, 'ladder', 'ladders')} back up.`;
  if (p.snakes) return `Rode ${plural(p.snakes, 'snake', 'snakes')} down and dodged every ladder.`;
  if (p.ladders) return `Climbed ${plural(p.ladders, 'ladder', 'ladders')} back up and never caught a snake.`;
  return 'Never touched a snake or a ladder.';
}
function showEnd(m, me, opts){
  const order = standingsSnakes(m), w = m.seats.find(s => s.id === m.winner);
  const lostToBot = opts.local && opts.solo && w && w.type === 'bot';
  const throws = Math.max(0, ...m.seats.map(s => (s.moves || []).length));
  $('#end-title').textContent = !w ? 'Game over' : isYou(w) ? 'You’re home' : `${w.name} is home`;
  $('#end-sticker').textContent = w ? `Won ${w.wins} ${w.wins === 1 ? 'throw' : 'throws'}` : 'Game over';
  const others = m.seats.filter(s => !s.left && s !== w).length;
  $('#end-sub').textContent = w ? `${journey(w)} ${throws} throws in all.${others ? '' : ' Everyone else left.'}${lostToBot ? ' Rematch?' : ''}` : '';
  $('#end-cards').innerHTML = w ? `<div class="sl-token big" style="--seat:${w.color}">${esc(ui.initial(w.real || w.name))}</div><figcaption>From 100 to home</figcaption>` : '';
  $('#standings').innerHTML = order.map((p, i) => `<li class="srow"><span class="rank">${i + 1}</span>${ui.avatarHTML(p.type, p.real || p.name, p.color)}<span class="sname">${esc(p.name)}<small>${esc(p.left ? 'Left the game' : p.id === m.winner ? 'Home' : `On ${p.pos}`)} · ${p.wins} ${p.wins === 1 ? 'throw' : 'throws'} won</small></span><span class="sval">${p.pos === 0 ? '0' : p.pos}</span></li>`).join('');
  $('#finds-title').textContent = 'How the race went';
  const subjects = me ? [m.seats.find(s => s.id === me), ...m.seats.filter(s => s.id !== me)].filter(Boolean) : m.seats.slice();
  $('#finds').className = 'finds' + (subjects.length > 1 ? ' two' : '');
  $('#finds').innerHTML = subjects.map(p => {
    const T = p.moves ? p.moves.length : 0, c = [0, 0, 0];
    (p.moves || []).forEach(x => c[x]++);
    const pct = c.map(x => T ? Math.round(100 * x / T) : 0);
    const lines = [`Won ${p.wins} of ${T} throws.`, journey(p)];
    return `<article class="find"><header>${ui.avatarHTML(p.type, p.real || p.name, p.color, true)}<span>${esc(p.name)}</span></header>
      <div class="split" role="img" aria-label="Stone ${pct[0]}%, paper ${pct[1]}%, scissors ${pct[2]}%">${pct.map((x, k) => x ? `<span class="s${k}" style="flex:${x}"></span>` : '').join('')}</div>
      <div class="legend">${pct.map((x, k) => `<span><i class="s${k}"></i>${SHAPES[k]} ${x}%</span>`).join('')}</div>
      <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></article>`;
  }).join('');
  $('#copybox').hidden = true;
  $('#btn-copy').textContent = 'Copy the result';
  document.body.dataset.end = 'snakes';
  $('#end-actions').innerHTML = opts.actionsHTML || `<button class="cta wide" type="button" data-act="sl-play"><span>Play again</span><span class="arrow" data-icon="again"></span></button><button class="btn2" type="button" data-act="setup">Setup</button>`;
  ui.paintIcons($('#end-actions'));
  if (ui.screen !== 'end') { ui.show('end'); window.scrollTo(0, 0); }
  if (!opts.quiet && w) {
    if (lostToBot) ui.sfx.lose();
    else { ui.sfx.fanfare(); ui.confetti([w.color, '#c8ff00', '#ffffff', '#d54141', '#137eff']); }
  }
  showEnd.summary = `Snakes & Ladders, 100 to 0: ${order.map(p => `${p.real || p.name} ${p.pos === 0 ? 'home' : 'on ' + p.pos}`).join(', ')}.`;
}
export const summary = () => showEnd.summary || '';
