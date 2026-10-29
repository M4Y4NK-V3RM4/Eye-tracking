import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, playRound, nextRound, activeSeats, leaveMatch, standings } from '../shared/engine.js';
import { beats, knockoutOdds } from '../shared/rules.js';

const seats = n => Array.from({length: n}, (_, i) => ({id: 'p' + i, name: 'P' + i, color: '#000'}));
const S = 0, P = 1, X = 2;   // stone, paper, scissors

test('the cycle: paper wraps stone, scissors cut paper, stone blunts scissors', () => {
  assert.ok(beats(P, S) && beats(X, P) && beats(S, X));
  assert.ok(!beats(S, P) && !beats(P, X) && !beats(X, S) && !beats(S, S));
});

test('two players play best of 5: draws do not count, first to 3 wins', () => {
  const m = createMatch({seats: seats(2), bestOf: 5});
  assert.equal(m.mode, 'duel');
  assert.equal(playRound(m, {p0: S, p1: S}).kind, 'draw');
  for (let i = 0; i < 3; i++) { nextRound(m); const r = playRound(m, {p0: P, p1: S}); assert.equal(r.kind, 'win'); assert.deepEqual(r.winners, ['p0']); }
  assert.ok(m.over);
  assert.equal(m.winner, 'p0');
  assert.equal(m.seats[0].score, 3);
});

test('points: one point for every player you beat', () => {
  const m = createMatch({seats: seats(6), mode: 'points', rounds: 5});
  // three stones, two scissors, a paper: each stone scores 2, the paper 3, each scissors 1
  const r = playRound(m, {p0: S, p1: S, p2: S, p3: X, p4: X, p5: P});
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => r.gains['p' + i]), [2, 2, 2, 1, 1, 3]);
  assert.equal(r.verbs.length, 3);
});

test('points: a tie at the top after the last round goes to a throw-off', () => {
  const m = createMatch({seats: seats(3), mode: 'points', rounds: 1});
  const r = playRound(m, {p0: P, p1: P, p2: S});   // p0 and p1 score 1 each
  assert.deepEqual(r.throwoff, ['p0', 'p1']);
  assert.ok(!m.over);
  nextRound(m);
  assert.deepEqual(activeSeats(m).map(s => s.id), ['p0', 'p1']);
  assert.equal(playRound(m, {p0: S, p1: S}).kind, 'again');
  nextRound(m);
  const end = playRound(m, {p0: X, p1: P});
  assert.equal(end.kind, 'ko');
  assert.ok(m.over);
  assert.equal(m.winner, 'p0');
  assert.equal(m.seats[0].score, 1, 'throw-offs do not change the points');
});

test('knockout: a throw counts only when exactly two shapes show', () => {
  const m = createMatch({seats: seats(4), mode: 'knockout'});
  assert.equal(playRound(m, {p0: S, p1: P, p2: X, p3: S}).kind, 'again');
  nextRound(m);
  const r = playRound(m, {p0: S, p1: S, p2: X, p3: X});
  assert.deepEqual(r.outs, ['p2', 'p3']);
  nextRound(m);
  playRound(m, {p0: P, p1: S});
  assert.equal(m.winner, 'p0');
  assert.deepEqual(standings(m).map(s => s.id), ['p0', 'p1', 'p2', 'p3']);
});

test('sitting out: a round needs two throws, and sitters are left alone', () => {
  const m = createMatch({seats: seats(3), mode: 'knockout'});
  assert.equal(playRound(m, {p0: S}, []), null);
  const r = playRound(m, {p0: S, p1: X, p2: P}, ['p2']);
  assert.deepEqual(r.sat, ['p2']);
  assert.deepEqual(r.outs, ['p1']);
  assert.ok(!m.seats[2].out);
});

test('leaving: the last player still in wins', () => {
  const m = createMatch({seats: seats(3), mode: 'points', rounds: 5});
  leaveMatch(m, 'p1');
  assert.ok(!m.over);
  leaveMatch(m, 'p2');
  assert.ok(m.over);
  assert.equal(m.winner, 'p0');
});

test('knockout odds shrink as groups grow', () => {
  assert.equal(Math.round(knockoutOdds(2) * 100), 67);
  assert.equal(Math.round(knockoutOdds(6) * 100), 26);
});
