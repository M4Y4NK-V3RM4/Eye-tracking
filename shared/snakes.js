// Reverse Snakes & Ladders: everyone starts on 100 and races down to 0. Snakes now help (they slide
// you down, closer to home) and ladders set you back (they carry you up). Every turn starts with a
// throw of Stone Paper Scissors: whoever beats the most players rolls two dice. Used by the room
// server for online play and by the browser for play against bots.
import { beats, VERBS, rint } from './rules.js';

export const START = 100;
// The classic board from Mayank's photo: 11 snakes and 11 ladders, square for square.
export const SNAKES = [[98, 14], [94, 55], [88, 32], [82, 44], [78, 22], [68, 3], [66, 35], [59, 19], [49, 9], [37, 13], [30, 6]];   // head -> tail
export const LADDERS = [[2, 21], [11, 48], [17, 36], [23, 85], [31, 71], [39, 80], [46, 67], [53, 92], [62, 83], [65, 95], [74, 93]]; // foot -> top
const JUMPS = new Map([...SNAKES, ...LADDERS]);

// How long each part of a turn takes on screen, in ms. The server waits this long before the next
// throw's clock starts, so every phone finishes the same animation at the same moment.
export const TIMING = {reveal: 500, dice: 850, step: 45, slide: 550, gap: 150};

// Where square n sits, in a 1000 x 1100 space: the 10 x 10 board, then a strip below it for home (0).
// Square 1 is bottom left, rows snake back and forth, 100 is top left.
export function cellXY(n){
  if (n <= 0) return [50, 1050];
  const row = Math.floor((n - 1) / 10), i = (n - 1) % 10;
  const col = row % 2 === 0 ? i : 9 - i;
  return [col * 100 + 50, (9 - row) * 100 + 50];
}

// Moving `total` squares down from pos. Reaching 0 or beyond is home; no exact roll needed.
export function moveFrom(pos, total){
  const landed = Math.max(0, pos - total);
  const jump = landed > 0 ? JUMPS.get(landed) : undefined;
  if (jump == null) return {landed, to: landed, via: null};
  return {landed, to: jump, via: jump < landed ? 'snake' : 'ladder'};
}

export function createSnakes({seats, id = 1}){
  return {
    id, game: 'snakes', mode: 'snakes', round: 1, over: false, winner: null, throwoff: null, log: [],
    seats: seats.map(s => ({
      id: s.id, name: s.name, color: s.color, type: s.type || 'person', pos: START,
      left: false, out: false, tOut: false, outRound: 0, score: 0,
      wins: 0, snakes: 0, ladders: 0, moves: [], results: [], rounds: [], fav: rint(3)
    }))
  };
}
export const activeSnakes = m => m.seats.filter(s => !s.left);
export const nextSnakes = m => { if (!m.over) m.round++; };
const rollDie = () => 1 + rint(6);

// picks: {seatId: move}. Everyone throws at once; each player scores one for every player they beat.
// The top scorers roll, in seat order. If everyone scores the same (all one shape, or a perfect
// three-way split), nobody rolls and they throw again.
export function playSnakes(m, picks, sitOut = [], dice = () => [rollDie(), rollDie()]){
  if (m.over) return null;
  const act = activeSnakes(m);
  const playing = act.filter(s => picks[s.id] != null && !sitOut.includes(s.id));
  if (playing.length < 2) return null;
  const present = [...new Set(playing.map(s => picks[s.id]))].sort();
  const res = {
    round: m.round, played: playing.map(s => s.id), sat: act.filter(s => !playing.includes(s)).map(s => s.id),
    picks: {}, present, gains: {}, lost: {}, verbs: [], rollers: [], rolls: [], kind: 'roll', over: false, winner: null
  };
  for (const s of playing) {
    const mv = picks[s.id];
    let b = 0, l = 0;
    for (const q of playing) if (q !== s) { if (beats(mv, picks[q.id])) b++; else if (beats(picks[q.id], mv)) l++; }
    res.picks[s.id] = mv; res.gains[s.id] = b; res.lost[s.id] = l;
    s.moves.push(mv); s.results.push(Math.sign(b - l)); s.rounds.push(m.round);
  }
  for (const [w, l, v] of VERBS) if (present.includes(w) && present.includes(l)) res.verbs.push(v);
  const top = Math.max(...playing.map(s => res.gains[s.id]));
  if (playing.every(s => res.gains[s.id] === top)) res.kind = 'again';
  else {
    for (const s of playing.filter(q => res.gains[q.id] === top)) {
      res.rollers.push(s.id);
      if (m.over) continue;
      const d = dice(), total = d[0] + d[1], from = s.pos, mv = moveFrom(from, total);
      s.pos = mv.to; s.wins++;
      if (mv.via === 'snake') s.snakes++;
      if (mv.via === 'ladder') s.ladders++;
      res.rolls.push({id: s.id, dice: d, total, from, landed: mv.landed, to: mv.to, via: mv.via});
      if (s.pos === 0) { m.over = true; m.winner = s.id; }
    }
  }
  res.over = m.over; res.winner = m.winner;
  m.log.push(res);
  return res;
}

// How long a turn's result takes to play out on screen.
export function turnMs(res){
  if (!res) return 0;
  let t = TIMING.reveal;
  for (const r of res.rolls) t += TIMING.dice + (r.from - r.landed) * TIMING.step + (r.via ? TIMING.slide : 0) + TIMING.gap;
  return t;
}

export function leaveSnakes(m, id){
  const s = m.seats.find(x => x.id === id);
  if (!s || s.left || m.over) return;
  s.left = true;
  const rest = activeSnakes(m);
  if (rest.length === 1) { m.over = true; m.winner = rest[0].id; }
  else if (!rest.length) { m.over = true; m.winner = null; }
}

// The winner, then whoever is closest to home; anyone who left comes last.
export function standingsSnakes(m){
  const won = s => (s.id === m.winner ? 1 : 0);
  return m.seats.slice().sort((a, b) => won(b) - won(a) || a.left - b.left || a.pos - b.pos);
}
