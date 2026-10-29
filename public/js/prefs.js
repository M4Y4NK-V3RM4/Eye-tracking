// What this phone remembers: sound, the chant, the bots' notes, your name and which tab you use.
const KEY = 'kheeladi-sps-prefs-v1';
export const prefs = {sound: true, chant: true, thoughts: true, name: '', tab: 'online'};
try {
  const d = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (d) {
    for (const k of ['sound', 'chant', 'thoughts']) if (typeof d[k] === 'boolean') prefs[k] = d[k];
    if (typeof d.name === 'string') prefs.name = d.name.slice(0, 16);
    if (d.tab === 'online' || d.tab === 'local') prefs.tab = d.tab;
  }
} catch (e) {}
export function savePrefs(){ try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }
