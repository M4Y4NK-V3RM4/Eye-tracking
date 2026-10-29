// The game's facts. Plain ES module: the server imports it, and the browser loads it from /shared/.

export const SHAPES = ['Stone', 'Paper', 'Scissors'];
export const lc = m => SHAPES[m].toLowerCase();
export const beats = (a, b) => (a - b + 3) % 3 === 1;   // paper beats stone, scissors beat paper, stone beats scissors
export const up = m => (m + 1) % 3;                     // the shape that beats m
export const VERBS = [[0, 2, 'Stone blunts scissors'], [2, 1, 'Scissors cut paper'], [1, 0, 'Paper wraps stone']];
export const verbOf = (w, l) => VERBS.find(v => v[0] === w && v[1] === l)[2];
export const isMove = m => m === 0 || m === 1 || m === 2;

export const BEST_OF = [1, 3, 5, 7];
export const ROUNDS = [3, 5, 7, 10];
export const MODES = ['points', 'knockout'];
export const TIMERS = [0, 10, 20];          // seconds to pick online; 0 is no limit
export const MAX_ONLINE = 6;

export function rnd(){
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
export const rint = n => Math.floor(rnd() * n);
export function argmax(d){
  const mx = Math.max(...d), idx = [0, 1, 2].filter(i => d[i] === mx);
  return idx[rint(idx.length)];
}

// Share of throws that knock someone out when n people throw at random (exactly two shapes show).
export const knockoutOdds = n => 3 * (2 ** n - 2) / 3 ** n;
