// Bots for play on one phone. Every bot chooses before anyone else, from earlier rounds only.
// easy: habits you can spot. fair: random. sharp: reads each player's habits and throws the counter.
import { lc, up, rnd, rint, argmax } from './rules.js';
import { isYou, subj, vs, poss } from './words.js';

export const LEVELS = {
  easy: 'Easy bots have habits: they stick with a winner and move on after a loss. Spot it and beat them.',
  fair: 'Fair bots throw at random. Nobody can beat that in the long run, and it can’t beat you.',
  sharp: 'Sharp bots study each player’s habits and throw the counter. Stay unpredictable.'
};

const norm = d => { const s = d[0] + d[1] + d[2]; return s > 0 ? d.map(x => x / s) : [1 / 3, 1 / 3, 1 / 3]; };
const moveInRound = (p, r) => { const i = p.rounds.indexOf(r); return i < 0 ? undefined : p.moves[i]; };

// What each reading would predict for o's throw number k, from o's first k throws only.
export function readingsAt(o, k, bot){
  const M = o.moves, R = o.results, out = [];
  if (k < 1) return out;
  const last = M[k - 1];
  const f = [0, 0, 0];
  for (let i = 0; i < k; i++) f[M[i]] += .88 ** (k - 1 - i);
  out.push({id: 'freq', d: norm(f)});
  const m1 = [0, 0, 0]; let n1 = 0;
  for (let i = 1; i < k; i++) if (M[i - 1] === last) { m1[M[i]] += .9 ** (k - 1 - i); n1++; }
  if (n1) out.push({id: 'follow', d: norm(m1), a: last});
  const sh = [0, 0, 0]; let n2 = 0;
  for (let i = 1; i < k; i++) if (R[i - 1] === R[k - 1]) { sh[(M[i] - M[i - 1] + 3) % 3] += .9 ** (k - 1 - i); n2++; }
  if (n2) { const d = [0, 0, 0]; for (let s = 0; s < 3; s++) d[(last + s) % 3] = sh[s]; out.push({id: 'shift', d: norm(d), r: R[k - 1], s: argmax(sh)}); }
  if (k >= 3) {
    const a = M[k - 2], b = M[k - 1], m2 = [0, 0, 0]; let n3 = 0;
    for (let i = 2; i < k; i++) if (M[i - 2] === a && M[i - 1] === b) { m2[M[i]]++; n3++; }
    if (n3) out.push({id: 'pattern', d: norm(m2), a, b});
  }
  const bm = moveInRound(bot, o.rounds[k - 1]);
  if (bm !== undefined) { const d = [0, 0, 0]; d[up(bm)] = 1; out.push({id: 'counter', d, b: bm}); }
  return out;
}

// The reading that would have called o's past throws best, if it beats chance.
export function bestReading(o, bot){
  const T = o.moves.length;
  if (T < 3) return null;
  const hit = {}, seen = {};
  for (let k = 2; k < T; k++) {
    const w = .85 ** (T - 1 - k);
    for (const rd of readingsAt(o, k, bot)) {
      const mx = Math.max(...rd.d), ties = rd.d.filter(x => x === mx).length;
      hit[rd.id] = (hit[rd.id] || 0) + w * (rd.d[o.moves[k]] === mx ? 1 / ties : 0);
      seen[rd.id] = (seen[rd.id] || 0) + w;
    }
  }
  let best = null;
  for (const rd of readingsAt(o, T, bot)) {
    const n = seen[rd.id] || 0;
    if (n < 1.2) continue;
    const acc = ((hit[rd.id] || 0) + 1 / 3) / (n + 1);
    if (!best || acc > best.acc) best = {...rd, acc};
  }
  return best && best.acc >= .45 ? best : null;
}

function readingWords(rd, o, bot, pm){
  switch (rd.id) {
    case 'freq': return `${poss(o)} favourite so far`;
    case 'follow': return `${subj(o)} often ${vs(o, 'follow')} ${lc(rd.a)} with ${lc(pm)}`;
    case 'shift': {
      const after = rd.r > 0 ? 'a win' : rd.r < 0 ? 'a loss' : 'a draw';
      return `${subj(o)} ${vs(o, 'tend')} to ${rd.s === 0 ? 'stay' : 'switch'} after ${after}`;
    }
    case 'pattern': return `${lc(rd.a)} then ${lc(rd.b)} has led to ${lc(pm)} before`;
    default: return `${subj(o)} ${isYou(o) ? 'have' : 'has'} been countering ${bot.name}’s last throw`;
  }
}

// Returns {move, note, preds}: the throw, the sentence shown after the reveal, and its guesses per opponent.
export function botChoose(level, p, act){
  const opps = act.filter(q => q !== p);
  if (level === 'fair') return {move: rint(3), note: 'Threw at random. No habit to read.', preds: {}};
  if (level === 'easy') {
    const t = p.moves.length;
    if (!t) return {move: p.fav, note: `Opened with its favourite, ${lc(p.fav)}.`, preds: {}};
    const last = p.moves[t - 1], res = p.results[t - 1];
    if (res > 0 && rnd() < .72) return {move: last, note: `Won with ${lc(last)}, so stuck with it.`, preds: {}};
    if (res < 0 && rnd() < .72) return {move: up(last), note: `Lost with ${lc(last)}, so moved on to ${lc(up(last))}.`, preds: {}};
    if (rnd() < .5) return {move: p.fav, note: `Went back to its favourite, ${lc(p.fav)}.`, preds: {}};
    const m = rint(3); return {move: m, note: `Picked ${lc(m)} on a whim.`, preds: {}};
  }
  // Sharp. Two sharp bots with the same history reason alike, so after a draw against bots it throws at random.
  const t = p.moves.length;
  if (t && p.results[t - 1] === 0 && opps.every(o => o.type === 'bot') && rnd() < .6) {
    return {move: rint(3), note: 'Drew last time, so threw at random to avoid a mirror match.', preds: {}};
  }
  const ev = [0, 0, 0], preds = {};
  let lead = null;
  for (const o of opps) {
    const rd = bestReading(o, p);
    if (!rd) continue;
    const pm = argmax(rd.d);
    preds[o.id] = pm;
    for (let m = 0; m < 3; m++) ev[m] += rd.acc * (rd.d[(m + 2) % 3] - rd.d[(m + 1) % 3]);
    if (!lead || rd.acc > lead.rd.acc) lead = {o, rd, pm};
  }
  if (!lead) {
    // No personal habit yet: lean on how people tend to play (stick with a winner, move up after a loss).
    for (const o of opps) {
      const n = o.moves.length, r = n ? o.results[n - 1] : 0;
      if (!r || n >= 8) continue;
      const last = o.moves[n - 1], pm = r > 0 ? last : up(last), d = [.29, .29, .29];
      d[pm] = .42;
      for (let m = 0; m < 3; m++) ev[m] += .5 * (d[(m + 2) % 3] - d[(m + 1) % 3]);
      if (!lead) lead = {o, pm, r};
    }
    if (!lead || rnd() < .15) return {move: rint(3), note: 'No clear habit yet, so threw at random.', preds};
    const move = argmax(ev), who = isYou(lead.o) ? 'you' : lead.o.name;
    return {move, note: `Guessed ${lc(lead.pm)} from ${who} (people often ${lead.r > 0 ? 'stick with a winner' : 'move up after a loss'}), so threw ${lc(move)}.`, preds};
  }
  if (rnd() < .1) return {move: rint(3), note: 'Threw at random this time, so it’s harder to read.', preds};
  const move = argmax(ev);
  const who = isYou(lead.o) ? 'you' : lead.o.name;
  const rest = opps.length > 1 ? ' and weighed the others' : '';
  const d = lead.rd.d, ord = [0, 1, 2].sort((a, b) => d[b] - d[a]);
  const expect = d[ord[0]] - d[ord[1]] < .12 ? `${lc(ord[0])} or ${lc(ord[1])}` : lc(ord[0]);
  return {move, note: `Expected ${expect} from ${who} (${readingWords(lead.rd, lead.o, p, lead.pm)})${rest}, so threw ${lc(move)}.`, preds};
}
