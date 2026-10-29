// One match: who is still in, what a round of throws does to the scores, and when it is over.
// Used by the room server for online play and by the browser for play on one phone.
import { beats, VERBS, rint } from './rules.js';

// seats: [{id, name, color, type}]. Two seats play best-of; three or more play points or knockout.
export function createMatch({ seats, bestOf = 5, mode = 'points', rounds = 5, id = 1 }){
  return {
    id, mode: seats.length === 2 ? 'duel' : mode, bestOf, target: Math.ceil(bestOf / 2), totalRounds: rounds,
    round: 1, throwoff: null, throwoffFrom: 0, over: false, winner: null, log: [],
    seats: seats.map(s => ({
      id: s.id, name: s.name, color: s.color, type: s.type || 'person',
      score: 0, out: false, tOut: false, left: false, outRound: 0,
      moves: [], results: [], rounds: [], fav: rint(3)
    }))
  };
}

export const seatOf = (m, id) => m.seats.find(s => s.id === id);

// Seats that throw this round: not knocked out, not gone, and in the throw-off when there is one.
export function activeSeats(m){
  return m.seats.filter(s => !s.out && !s.left && (!m.throwoff || (m.throwoff.includes(s.id) && !s.tOut)));
}

// picks: {seatId: move}. Seats in sitOut, or without a pick, sit this round out.
// Returns the round's result, or null when fewer than two seats threw.
export function playRound(m, picks, sitOut = []){
  if (m.over) return null;
  const act = activeSeats(m);
  const playing = act.filter(s => picks[s.id] != null && !sitOut.includes(s.id));
  if (playing.length < 2) return null;
  const present = [...new Set(playing.map(s => picks[s.id]))].sort();
  const res = {
    round: m.round, played: playing.map(s => s.id), sat: act.filter(s => !playing.includes(s)).map(s => s.id),
    picks: {}, present, gains: {}, lost: {}, verbs: [], winners: [], losers: [], outs: [],
    kind: '', throwoff: null, over: false, winner: null
  };
  for (const s of playing) {
    const mv = picks[s.id];
    let b = 0, l = 0;
    for (const q of playing) if (q !== s) { if (beats(mv, picks[q.id])) b++; else if (beats(picks[q.id], mv)) l++; }
    res.picks[s.id] = mv; res.gains[s.id] = b; res.lost[s.id] = l;
    s.moves.push(mv); s.results.push(Math.sign(b - l)); s.rounds.push(m.round);
  }
  for (const [w, l, v] of VERBS) if (present.includes(w) && present.includes(l)) res.verbs.push(v);

  if (m.mode === 'duel') {
    const w = playing.find(s => res.gains[s.id] > 0);
    if (w) { w.score++; res.kind = 'win'; res.winners = [w.id]; res.losers = playing.filter(s => s !== w).map(s => s.id); }
    else res.kind = 'draw';
  } else if (m.mode === 'points' && !m.throwoff) {
    for (const s of playing) s.score += res.gains[s.id];
    res.kind = 'points';
  } else if (present.length === 2) {
    // Knockout, and the throw-off that settles a points tie: the losing shape is out.
    res.kind = 'ko';
    for (const s of playing) {
      if (res.lost[s.id]) { res.outs.push(s.id); if (m.throwoff) s.tOut = true; else { s.out = true; s.outRound = m.round; } }
      else res.winners.push(s.id);
    }
  } else res.kind = 'again';

  settle(m, res);
  m.log.push(res);
  return res;
}

function finish(m, id){ m.over = true; m.winner = id; }

function settle(m, res){
  const here = m.seats.filter(s => !s.left);
  if (m.mode === 'duel') {
    const w = here.find(s => s.score >= m.target);
    if (w) finish(m, w.id);
  } else if (m.mode === 'knockout' || m.throwoff) {
    const a = activeSeats(m);
    if (a.length === 1) finish(m, a[0].id);
  } else if (m.round >= m.totalRounds) {
    const max = Math.max(...here.map(s => s.score)), top = here.filter(s => s.score === max);
    if (top.length === 1) finish(m, top[0].id);
    else { m.throwoff = top.map(s => s.id); m.throwoffFrom = m.round + 1; res.throwoff = m.throwoff.slice(); }
  }
  res.over = m.over; res.winner = m.winner;
}

export function nextRound(m){ if (!m.over) m.round++; }

// A player leaves for good. With one player left in play, that player wins.
export function leaveMatch(m, id){
  const s = seatOf(m, id);
  if (!s || s.left || m.over) return;
  s.left = true;
  if (!s.out) s.outRound = m.round;
  const rest = activeSeats(m);
  if (rest.length === 1) finish(m, rest[0].id);
  else if (!rest.length) {
    const here = m.seats.filter(q => !q.left).sort((a, b) => b.score - a.score);
    if (here.length) finish(m, here[0].id); else { m.over = true; m.winner = null; }
  }
}

// Final order: the winner, then by score (or by how long they lasted in a knockout); leavers last.
export function standings(m){
  const won = s => (s.id === m.winner ? 1 : 0);
  const lasted = s => (s.outRound || 1e9);
  return m.seats.slice().sort((a, b) => won(b) - won(a) || a.left - b.left ||
    (m.mode === 'knockout' ? lasted(b) - lasted(a) : b.score - a.score));
}
