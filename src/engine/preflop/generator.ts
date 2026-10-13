import { COMBOS, HAND_COUNT } from '../cards';
import type { Rng } from '../rng';
import { type PreflopChart, chartFor, mainActionOf } from './charts';
import { type PreflopKind, type PreflopSituation, type PreflopSpot, type StackDepth, validSituations } from './spots';

export type PreflopGeneratorOptions = {
  kinds?: readonly PreflopKind[];
  stacks?: readonly StackDepth[];
  categoryWeights?: ReadonlyMap<string, number>;
  randomShare?: number;
};

const DEFAULT_RANDOM_SHARE = 0.15;
const BOUNDARY_WEIGHT = 6;
const SIZE = 13;

export const preflopCategoryKey = (s: PreflopSituation): string => `${s.kind}|${s.hero}|${s.stack}`;

export function boundaryHands(chart: PreflopChart): boolean[] {
  return Array.from({ length: HAND_COUNT }, (_, hand) => {
    if (chart.close.has(hand)) return true;
    const action = mainActionOf(chart, hand);
    const row = Math.floor(hand / SIZE);
    const col = hand % SIZE;
    const neighbours = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ].filter(([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE);
    return neighbours.some(([r, c]) => mainActionOf(chart, r * SIZE + c) !== action);
  });
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (!Number.isFinite(w) || w < 0) throw new Error(`Ungültiges Gewicht: ${w}`);
    total += w;
  }
  if (!(total > 0)) throw new Error(`Ungültiges Gesamtgewicht: ${total}`);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

export function generatePreflopSpot(rng: Rng, options: PreflopGeneratorOptions = {}): PreflopSpot {
  const kinds = options.kinds ?? ['rfi', 'vsOpen', 'vs3bet'];
  const stacks = options.stacks ?? [40, 100];
  const groups = new Map<string, PreflopSituation[]>();
  for (const s of validSituations()) {
    if (!kinds.includes(s.kind) || !stacks.includes(s.stack)) continue;
    const key = preflopCategoryKey(s);
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size === 0) throw new Error('Keine Starthand-Spots für diese Filter');

  const key = pickWeighted([...groups.keys()], (k) => options.categoryWeights?.get(k) ?? 1, rng);
  const candidates = groups.get(key)!;
  const situation = candidates[Math.floor(rng() * candidates.length)];

  const chart = chartFor(situation);
  const boundary = boundaryHands(chart);
  const uniform = rng() < (options.randomShare ?? DEFAULT_RANDOM_SHARE);
  const hands = Array.from({ length: HAND_COUNT }, (_, h) => h);
  const hand = pickWeighted(hands, (h) => COMBOS[h].length * (!uniform && boundary[h] ? BOUNDARY_WEIGHT : 1), rng);
  return { ...situation, hand };
}
