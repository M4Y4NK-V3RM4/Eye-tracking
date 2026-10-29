import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnakes, playSnakes, nextSnakes, moveFrom, cellXY, turnMs, leaveSnakes, standingsSnakes, SNAKES, LADDERS, START, TIMING } from '../shared/snakes.js';

const seats = n => Array.from({length: n}, (_, i) => ({id: 'p' + i, name: 'P' + i, color: '#000'}));
const S = 0, P = 1, X = 2;
const fixed = (...rolls) => () => rolls.shift();

test('the board: every snake goes down, every ladder up, and no square does two things', () => {
  for (const [h, t] of SNAKES) assert.ok(h > t && t > 0 && h < START, `snake ${h} -> ${t}`);
  for (const [f, t] of LADDERS) assert.ok(f < t && f > 0 && t < START, `ladder ${f} -> ${t}`);
  const starts = [...SNAKES, ...LADDERS].map(x => x[0]), ends = [...SNAKES, ...LADDERS].map(x => x[1]);
  assert.equal(new Set(starts).size, starts.length, 'one jump per square');
  assert.ok(ends.every(e => !starts.includes(e)), 'no jump lands on another jump');
});

test('squares snake back and forth: 1 bottom left, 10 bottom right, 11 above 10, 100 top left, home below 1', () => {
  assert.deepEqual(cellXY(1), [50, 950]);
  assert.deepEqual(cellXY(10), [950, 950]);
  assert.deepEqual(cellXY(11), [950, 850]);
  assert.deepEqual(cellXY(100), [50, 50]);
  assert.deepEqual(cellXY(0), [50, 1050]);
});

test('moving down: snakes help, ladders hurt, and any roll past 0 is home', () => {
  const [head, tail] = SNAKES[0], [foot, top] = LADDERS[0];
  assert.deepEqual(moveFrom(head + 5, 5), {landed: head, to: tail, via: 'snake'});
  assert.deepEqual(moveFrom(foot + 4, 4), {landed: foot, to: top, via: 'ladder'});
  assert.deepEqual(moveFrom(7, 12), {landed: 0, to: 0, via: null});
});

test('two players: the winner of the throw rolls; a draw is thrown again', () => {
  const m = createSnakes({seats: seats(2)});
  const draw = playSnakes(m, {p0: S, p1: S});
  assert.equal(draw.kind, 'again');
  assert.deepEqual(draw.rolls, []);
  nextSnakes(m);
  const r = playSnakes(m, {p0: P, p1: S}, [], fixed([3, 4]));
  assert.deepEqual(r.rollers, ['p0']);
  assert.deepEqual(r.rolls[0], {id: 'p0', dice: [3, 4], total: 7, from: 100, landed: 93, to: 93, via: null});
  assert.equal(m.seats[0].pos, 93);
  assert.equal(m.seats[1].pos, START);
});

test('groups: whoever beats the most players rolls; a perfect split is thrown again', () => {
  const m = createSnakes({seats: seats(4)});
  // stone, stone, paper, scissors: paper beats both stones (2), so paper alone rolls
  const r = playSnakes(m, {p0: S, p1: S, p2: P, p3: X}, [], fixed([2, 2]));
  assert.deepEqual(r.rollers, ['p2']);
  nextSnakes(m);
  const tie = playSnakes(createSnakes({seats: seats(3)}), {p0: S, p1: P, p2: X});
  assert.equal(tie.kind, 'again');
  // two stones beat a pair of scissors: both stones roll, in seat order
  const two = playSnakes(createSnakes({seats: seats(4)}), {p0: S, p1: X, p2: S, p3: X}, [], fixed([1, 1], [6, 6]));
  assert.deepEqual(two.rolls.map(x => [x.id, x.total]), [['p0', 2], ['p2', 12]]);
});

test('reaching home wins at once, even with rolls still to come', () => {
  const m = createSnakes({seats: seats(3)});
  m.seats[0].pos = 5; m.seats[2].pos = 4;
  const r = playSnakes(m, {p0: S, p1: X, p2: S}, [], fixed([3, 3], [6, 6]));
  assert.ok(m.over);
  assert.equal(m.winner, 'p0');
  assert.equal(r.rolls.length, 1, 'nobody rolls after the game is won');
  assert.deepEqual(standingsSnakes(m).map(s => s.id), ['p0', 'p2', 'p1']);
});

test('a turn takes as long on screen as its dice, steps and slides', () => {
  const r = {rolls: [{from: 60, landed: 53, via: null}, {from: 50, landed: 47, via: 'snake'}]};
  assert.equal(turnMs(r), TIMING.reveal + TIMING.dice * 2 + 10 * TIMING.step + TIMING.slide + TIMING.gap * 2);
});

test('leaving: the last player still in wins', () => {
  const m = createSnakes({seats: seats(2)});
  leaveSnakes(m, 'p1');
  assert.ok(m.over);
  assert.equal(m.winner, 'p0');
});
