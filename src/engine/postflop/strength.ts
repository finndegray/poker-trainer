import { type Card, rankOf, suitOf } from '../cards';
import { evaluate7 } from '../evaluator';
import { COMBO_A, COMBO_B, COMBO_COUNT } from './combos';

const WHEEL = (1 << 12) | 0b1111;

/** Highest rank of a straight inside a 13-bit rank mask, or -1 (the wheel counts as 3, the Five). */
export function straightHigh(mask: number): number {
  for (let hi = 12; hi >= 4; hi--) {
    const run = 0b11111 << (hi - 4);
    if ((mask & run) === run) return hi;
  }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}

export type Draw = { flushOuts: number; straightOuts: number; outs: number };
const NO_DRAW: Draw = { flushOuts: 0, straightOuts: 0, outs: 0 };

/**
 * Outs to a straight or a flush that uses at least one hole card. Flush draw: four cards of a suit with at least one
 * of them in the hand. Straight draw: every rank that completes a straight which the board alone would not make.
 * No draw once the hand already holds a flush; no straight draw once it holds a straight. On the river: none.
 */
export function drawOuts(hole: readonly Card[], board: readonly Card[]): Draw {
  if (board.length >= 5) return NO_DRAW;
  let seenLow = 0;
  let seenHigh = 0;
  const see = (c: Card) => (c < 26 ? (seenLow |= 1 << c) : (seenHigh |= 1 << (c - 26)));
  const seen = (c: Card) => (c < 26 ? (seenLow >> c) & 1 : (seenHigh >> (c - 26)) & 1) === 1;
  const suitCount = [0, 0, 0, 0];
  const holeSuits = [0, 0, 0, 0];
  let mask = 0;
  let boardMask = 0;
  for (const c of hole) {
    see(c);
    suitCount[suitOf(c)]++;
    holeSuits[suitOf(c)]++;
    mask |= 1 << rankOf(c);
  }
  for (const c of board) {
    see(c);
    suitCount[suitOf(c)]++;
    mask |= 1 << rankOf(c);
    boardMask |= 1 << rankOf(c);
  }
  if (suitCount.some((n) => n >= 5)) return NO_DRAW;

  const outs = new Set<Card>();
  let flushOuts = 0;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] !== 4 || holeSuits[s] === 0) continue;
    for (let r = 0; r < 13; r++) {
      const c = r * 4 + s;
      if (!seen(c)) {
        outs.add(c);
        flushOuts++;
      }
    }
  }
  let straightOuts = 0;
  if (straightHigh(mask) < 0) {
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      const made = straightHigh(mask | (1 << r));
      if (made < 0 || made <= straightHigh(boardMask | (1 << r))) continue;
      for (let s = 0; s < 4; s++) {
        const c = r * 4 + s;
        if (seen(c)) continue;
        straightOuts++;
        outs.add(c);
      }
    }
  }
  return { flushOuts, straightOuts, outs: outs.size };
}

/**
 * Strength of every combo on this board, used to order a range (higher = stronger), 0 for combos that collide
 * with the board. Made hand: share of all other combos it beats right now (ties count half). Draw value: the chance
 * to hit an out, `outs × potPerOut` (rule of 2 and 4), which lifts the part the made hand does not win yet:
 * strength = made + (1 − made) × min(1, outs × potPerOut).
 */
export function comboStrengths(board: readonly Card[], potPerOut: number): Float64Array {
  const cards = new Int32Array(board.length + 2);
  board.forEach((c, i) => (cards[i + 2] = c));
  const blocked = (i: number) => board.includes(COMBO_A[i]) || board.includes(COMBO_B[i]);
  const scores = new Float64Array(COMBO_COUNT).fill(-1);
  const live: number[] = [];
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (blocked(i)) continue;
    cards[0] = COMBO_A[i];
    cards[1] = COMBO_B[i];
    scores[i] = evaluate7(cards);
    live.push(i);
  }
  const sorted = live.map((i) => scores[i]).sort((x, y) => x - y);
  const below = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const above = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const out = new Float64Array(COMBO_COUNT);
  const others = Math.max(1, live.length - 1);
  for (const i of live) {
    const v = scores[i];
    const lower = below(v);
    const equal = above(v) - lower - 1;
    const made = (lower + equal / 2) / others;
    const draw = potPerOut > 0 ? Math.min(1, drawOuts([COMBO_A[i], COMBO_B[i]], board).outs * potPerOut) : 0;
    out[i] = made + (1 - made) * draw;
  }
  return out;
}
