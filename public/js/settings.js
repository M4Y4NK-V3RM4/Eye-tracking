// "How to win" controls, shared by one-phone setup and the online lobby.
// Buttons carry data-set (the setting) and data-val; app.js sends them to whoever owns the settings.
import { BEST_OF, ROUNDS, TIMERS, knockoutOdds } from '/shared/rules.js';
import { esc } from './ui.js';

const chip = (key, val, label, on, enabled) =>
  `<button type="button" class="chip" data-set="${key}" data-val="${val}" aria-pressed="${on}"${enabled ? '' : ' disabled'}>${label}</button>`;
const seg = (key, opts, cur, enabled) =>
  `<div class="seg fill" role="group">${opts.map(([v, l]) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${v === cur}"${enabled ? '' : ' disabled'}>${l}</button>`).join('')}</div>`;

export function duelHint(s){
  return s.bestOf === 1 ? 'One throw decides it. A draw is thrown again.' : `Draws don’t count. First to ${Math.ceil(s.bestOf / 2)} wins.`;
}
export function groupHint(s, n){
  if (s.mode === 'points') return `Score 1 for every player you beat. Most points after ${s.rounds} rounds wins. A tie at the top goes to a throw-off.`;
  const odds = n >= 3 ? ` With ${n} players, about ${Math.round(100 * knockoutOdds(n))}% of throws knock someone out.` : '';
  return `A throw counts when exactly two shapes show, and the losing shape is out. Last one standing wins.${odds}`;
}
const bestOfLabel = v => v === 1 ? 'One throw' : `Best of ${v}`;

function duelControls(s, on){
  return `<div class="chips" role="group" aria-label="Match length">${BEST_OF.map(v => chip('bestOf', v, bestOfLabel(v), s.bestOf === v, on)).join('')}</div>`;
}
function groupControls(s, on){
  return seg('mode', [['points', 'Points'], ['knockout', 'Knockout']], s.mode, on) +
    (s.mode === 'points' ? `<div class="chips" role="group" aria-label="Number of rounds">${ROUNDS.map(v => chip('rounds', v, `${v} rounds`, s.rounds === v, on)).join('')}</div>` : '');
}

// One phone: the number of players is known, so only the rule that applies is shown.
export function localWinHTML(s, n){
  return `<h2 class="label" id="l-win">How to win</h2>${n === 2 ? duelControls(s, true) : groupControls(s, true)}<p class="hint">${esc(n === 2 ? duelHint(s) : groupHint(s, n))}</p>`;
}

// Online: people may still join, so the host sets both, and sees which one applies now.
export function onlineSettingsHTML(s, n, isHost, hostName){
  if (!isHost) {
    const rule = n <= 2 ? `<b>${bestOfLabel(s.bestOf)}.</b> ${esc(duelHint(s))}` : `<b>${s.mode === 'points' ? `Points, ${s.rounds} rounds` : 'Knockout'}.</b> ${esc(groupHint(s, n))}`;
    const timer = s.timer ? `${s.timer} seconds to throw, then a random throw is made for you.` : 'No time limit to throw.';
    return `<h2 class="label">How to win</h2><div class="ro"><p>${rule}</p><p class="hint">${esc(timer)} ${esc(hostName)} sets the rules.</p></div>`;
  }
  const now = n <= 1 ? '' : n === 2 ? ' · playing now' : '';
  return `<h2 class="label">How to win</h2>
    <div class="field"><p class="hint"><b>Two players</b>${n === 2 ? now : ''}</p>${duelControls(s, true)}<p class="hint">${esc(duelHint(s))}</p></div>
    <div class="field"><p class="hint"><b>Three or more</b>${n >= 3 ? ' · playing now' : ''}</p>${groupControls(s, true)}<p class="hint">${esc(groupHint(s, Math.max(n, 3)))}</p></div>
    <div class="field"><p class="hint"><b>Time to throw</b></p><div class="chips three" role="group" aria-label="Time to throw">${TIMERS.map(v => chip('timer', v, v ? `${v} seconds` : 'No limit', s.timer === v, true)).join('')}</div>
    <p class="hint">${s.timer ? 'When time runs out, anyone who hasn’t thrown gets a random throw.' : 'You can skip anyone who keeps the table waiting.'}</p></div>`;
}
