import { COMBOS, type Card, HAND_COUNT } from '../cards';

/** All 1326 two-card combos (a < b), in a fixed order; a combo range is one weight per entry. */
export const COMBO_COUNT = 1326;
export const COMBO_A = new Uint8Array(COMBO_COUNT);
export const COMBO_B = new Uint8Array(COMBO_COUNT);
const INDEX = new Int16Array(52 * 52).fill(-1);
{
  let i = 0;
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      COMBO_A[i] = a;
      COMBO_B[i] = b;
      INDEX[a * 52 + b] = i;
      INDEX[b * 52 + a] = i;
      i++;
    }
  }
}

export const comboIndex = (a: Card, b: Card): number => INDEX[a * 52 + b];

/** Weight per combo (index from `comboIndex`); 0 = not in the range. */
export type ComboRange = Float64Array;

/** Every combo of the flagged hand classes with weight 1. */
export function rangeFromClasses(flags: readonly boolean[]): ComboRange {
  const range = new Float64Array(COMBO_COUNT);
  for (let h = 0; h < HAND_COUNT; h++) {
    if (!flags[h]) continue;
    for (const [a, b] of COMBOS[h]) range[comboIndex(a, b)] = 1;
  }
  return range;
}

/** Card removal: combos that contain one of `cards` drop out. */
export function removeCards(range: ComboRange, cards: readonly Card[]): ComboRange {
  const out = Float64Array.from(range);
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (out[i] === 0) continue;
    for (const c of cards) {
      if (COMBO_A[i] === c || COMBO_B[i] === c) {
        out[i] = 0;
        break;
      }
    }
  }
  return out;
}

export function rangeWeight(range: ComboRange): number {
  let sum = 0;
  for (let i = 0; i < COMBO_COUNT; i++) sum += range[i];
  return sum;
}

const EPS = 1e-9;

/**
 * Keeps `share` (0–1) of the range weight: the strongest combos when `from` is 'strong', the weakest otherwise.
 * Combos are ordered by `strength` (higher = stronger). Combos of equal strength form one group; the group that
 * crosses the limit is kept with the same reduced weight for each of its combos, so the result never depends on
 * the order of equally strong combos and holds exactly `share` of the weight.
 */
export function keepShare(range: ComboRange, strength: Float64Array, share: number, from: 'strong' | 'weak'): ComboRange {
  const live: number[] = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (range[i] > 0) {
      live.push(i);
      total += range[i];
    }
  }
  const sign = from === 'strong' ? -1 : 1;
  live.sort((x, y) => sign * (strength[x] - strength[y]) || x - y);
  const out = new Float64Array(COMBO_COUNT);
  let left = Math.max(0, Math.min(1, share)) * total;
  for (let g = 0; g < live.length && left > EPS; ) {
    let end = g;
    let weight = 0;
    while (end < live.length && strength[live[end]] === strength[live[g]]) weight += range[live[end++]];
    const factor = weight <= left + EPS ? 1 : left / weight;
    for (let k = g; k < end; k++) out[live[k]] = range[live[k]] * factor;
    left -= weight * factor;
    g = end;
  }
  return out;
}
