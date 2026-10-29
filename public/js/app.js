// Entry point: routes /r/CODE invite links, sends every tap and key to online or one-phone play.
import * as ui from './ui.js';
import * as local from './local.js';
import * as online from './online.js';
import { prefs, savePrefs } from './prefs.js';
const { $, $$ } = ui;

let mode = 'local';   // who owns the table right now: 'local' or 'online'

function setTab(tab){
  prefs.tab = tab; savePrefs();
  $('#tab-online').setAttribute('aria-selected', tab === 'online');
  $('#tab-local').setAttribute('aria-selected', tab === 'local');
  $('#panel-online').hidden = tab !== 'online';
  $('#panel-local').hidden = tab !== 'local';
}
function goHome(tab){
  if (local.isPlaying()) local.end();
  if (location.pathname !== '/' && !online.hasSession()) history.replaceState(null, '', '/');
  setTab(tab || prefs.tab);
  local.renderSetup();
  $('#my-name').value = prefs.name;
  ui.show('home');
  window.scrollTo(0, 0);
}
function syncToggles(){ $$('[data-pref]').forEach(i => { i.checked = prefs[i.dataset.pref]; }); }

const actions = {
  rules: () => ui.openSheet('sheet-rules'),
  close: () => ui.closeSheets(),
  confirm: () => ui.runConfirm(),
  tab: t => setTab(t.dataset.tab),
  home: () => goHome('online'),
  sound: () => { prefs.sound = !prefs.sound; savePrefs(); ui.renderSoundButton(); syncToggles(); if (prefs.sound) ui.sfx.pick(); },
  copy: t => {
    const text = mode === 'online' ? online.summary() : local.summary();
    ui.copyText(text, t);
  },
  // one phone
  play: () => { mode = 'local'; local.play(); },
  ready: () => local.ready(),
  change: () => local.changeLast(),
  next: () => local.next(),
  pause: () => local.pause(),
  results: () => local.showEnd(),
  rematch: () => { mode = 'local'; local.play(); },
  setup: () => goHome('local'),
  quit: () => {
    if (mode === 'online') return online.leaveAsk();
    ui.confirmSheet('End this match?', 'The scores from this match won’t be kept.', 'End match', () => goHome('local'));
  },
  // online
  host: () => { mode = 'online'; online.host(); },
  join: () => { mode = 'online'; online.joinByCode(); },
  'join-link': () => { mode = 'online'; online.joinByLink(); },
  'leave-ask': () => online.leaveAsk(),
  share: t => online.share(t),
  'copy-link': t => ui.copyText(online.inviteLink(), t),
  kick: t => online.kick(t.dataset.pid),
  'o-start': () => online.start(),
  'o-rematch': () => online.rematch(),
  'o-lobby': () => online.toLobby(),
  'o-results': () => online.results(),
  'o-end-ask': () => online.endAsk(),
  skip: () => online.skip()
};

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-pick]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.pick != null) { (mode === 'online' ? online : local).choose(+d.pick); return; }
  if (d.set) { (ui.screen === 'lobby' ? online : local).setSetting(d.set, d.val); return; }
  if (ui.screen === 'home' && local.setupClick(t)) return;
  if (d.act && actions[d.act]) actions[d.act](t, e);
});
$$('[data-sheet]').forEach(s => s.addEventListener('click', e => { if (e.target === s) ui.closeSheets(); }));

document.addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('name-input') && t.dataset.seat != null) local.nameInput(t);
  if (t.id === 'my-name' || t.id === 'join-name') { prefs.name = t.value.slice(0, 16); savePrefs(); $('#online-error').textContent = ''; $('#join-error').textContent = ''; }
  if (t.id === 'join-code') {
    const v = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (v !== t.value) t.value = v;
    $('#online-error').textContent = '';
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.classList.contains('name-input') && t.dataset.seat != null) local.nameChange(t);
  if (t.dataset.pref) { prefs[t.dataset.pref] = t.checked; savePrefs(); syncToggles(); if (t.dataset.pref === 'sound' && t.checked) ui.sfx.pick(); }
});
$('#setup-form').addEventListener('submit', e => e.preventDefault());

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (ui.sheetOpen()) ui.closeSheets(); return; }
  const inField = e.target.closest('input, textarea');
  if (e.key === 'Enter' && inField) {
    if (e.target.id === 'join-code') { e.preventDefault(); actions.join(); }
    else if (e.target.id === 'my-name') { e.preventDefault(); $('#join-code').value.length === 4 ? actions.join() : actions.host(); }
    else if (e.target.id === 'join-name') { e.preventDefault(); actions['join-link'](); }
    return;
  }
  if (inField || e.metaKey || e.ctrlKey || e.altKey || ui.sheetOpen()) return;
  if (ui.screen !== 'play') return;
  if (['1', '2', '3'].includes(e.key) && $('#handoff').hidden) {
    const b = $(`#tray .pick[data-pick="${+e.key - 1}"]:not(:disabled)`);
    if (b) { e.preventDefault(); b.click(); }
    return;
  }
  if (e.key === 'Enter' && !e.target.closest('button')) {
    if (!$('#handoff').hidden) $('#ho-ready').click();
    else { const n = $('#tray [data-act="next"], #tray [data-act="results"], #tray [data-act="o-results"]'); n && n.click(); }
  }
});

// ---------- Boot ----------
ui.paintIcons();
$('#fan').innerHTML = [0, 1, 2].map(m => ui.cardHTML(m)).join('');
ui.drawCycle();
syncToggles();
$('#my-name').value = prefs.name;
setTab(prefs.tab);
local.renderSetup();
const invite = location.pathname.match(/^\/r\/([A-Za-z]{4})\/?$/);
if (invite) { mode = 'online'; online.openInvite(invite[1]); }
else if (online.hasSession()) { mode = 'online'; ui.show('home'); online.resume(); }
else ui.show('home');
