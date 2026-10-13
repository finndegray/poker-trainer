import type { Card } from '../cards';
import { evaluate7 } from '../evaluator';
import type { Rng } from '../rng';
import { COMBO_A, COMBO_B, COMBO_COUNT, type ComboRange } from './combos';

const points = (hero: number, villain: number) => (hero > villain ? 1 : hero === villain ? 0.5 : 0);

/**
 * Equity of `hero` against a weighted range on a flop, turn or river board (0–1); null when no combo is left.
 * River and turn are counted exactly (every combo, every river card); on the flop `samples` runouts are drawn with
 * `rng` (combo by weight, then turn and river), so a fixed seed always gives the same number.
 */
export function equityVsRange(hero: readonly [Card, Card], board: readonly Card[], range: ComboRange, rng: Rng, samples: number): number | null {
  const dead = new Uint8Array(52);
  for (const c of [...hero, ...board]) dead[c] = 1;
  const combos: number[] = [];
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (range[i] <= 0 || dead[COMBO_A[i]] || dead[COMBO_B[i]]) continue;
    combos.push(i);
    weights.push(range[i]);
    total += range[i];
  }
  if (total <= 0) return null;

  const h = new Int32Array(7);
  const v = new Int32Array(7);
  h[0] = hero[0];
  h[1] = hero[1];
  board.forEach((c, k) => {
    h[k + 2] = c;
    v[k + 2] = c;
  });

  if (board.length === 5) {
    const heroScore = evaluate7(h);
    let won = 0;
    combos.forEach((i, k) => {
      v[0] = COMBO_A[i];
      v[1] = COMBO_B[i];
      won += weights[k] * points(heroScore, evaluate7(v));
    });
    return won / total;
  }

  if (board.length === 4) {
    const heroScore = new Float64Array(52);
    for (let c = 0; c < 52; c++) {
      if (dead[c]) continue;
      h[6] = c;
      heroScore[c] = evaluate7(h);
    }
    let won = 0;
    let weight = 0;
    combos.forEach((i, k) => {
      v[0] = COMBO_A[i];
      v[1] = COMBO_B[i];
      for (let c = 0; c < 52; c++) {
        if (dead[c] || c === v[0] || c === v[1]) continue;
        v[6] = c;
        won += weights[k] * points(heroScore[c], evaluate7(v));
        weight += weights[k];
      }
    });
    return won / weight;
  }

  // Flop: Monte-Carlo over combo and runout.
  const cumulative = new Float64Array(combos.length);
  let acc = 0;
  weights.forEach((w, k) => (cumulative[k] = acc += w));
  let won = 0;
  for (let s = 0; s < samples; s++) {
    const target = rng() * total;
    let lo = 0;
    let hi = combos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    const i = combos[lo];
    const a = COMBO_A[i];
    const b = COMBO_B[i];
    let turn: number;
    do turn = Math.floor(rng() * 52);
    while (dead[turn] || turn === a || turn === b);
    let river: number;
    do river = Math.floor(rng() * 52);
    while (dead[river] || river === a || river === b || river === turn);
    h[5] = turn;
    h[6] = river;
    v[0] = a;
    v[1] = b;
    v[5] = turn;
    v[6] = river;
    won += points(evaluate7(h), evaluate7(v));
  }
  return won / samples;
}
