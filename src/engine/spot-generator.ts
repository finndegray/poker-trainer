import { COMBOS, HAND_COUNT } from './cards';
import { OPEN_POSITIONS, callerPositions } from './positions';
import { type Situation, type Spot, evRow } from './pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from './pushfold-data';
import type { Rng } from './rng';

export type SpotKind = 'open' | 'call';
export type StackBucket = '1-5' | '6-10' | '11-15' | '16-20';
export const STACK_BUCKETS: readonly StackBucket[] = ['1-5', '6-10', '11-15', '16-20'];
export type CategoryKey = string;

export type GeneratorOptions = {
  kinds?: readonly SpotKind[];
  minStack?: number;
  maxStack?: number;
  categoryWeights?: ReadonlyMap<CategoryKey, number>;
  randomShare?: number;
};

const DEFAULT_RANDOM_SHARE = 0.15;
const BOUNDARY_SOFTENING = 0.2;

export function stackBucketOf(stack: number): StackBucket {
  if (stack < MIN_STACK || stack > MAX_STACK) throw new Error(`Ungültiger Stack: ${stack} BB`);
  if (stack <= 5) return '1-5';
  if (stack <= 10) return '6-10';
  if (stack <= 15) return '11-15';
  return '16-20';
}

export const categoryKey = (s: Situation): CategoryKey =>
  `${s.kind}|${s.position}|${stackBucketOf(s.stack)}`;

function situations(kinds: readonly SpotKind[], minStack: number, maxStack: number): Situation[] {
  const out: Situation[] = [];
  for (let stack = minStack; stack <= maxStack; stack++) {
    for (const shover of OPEN_POSITIONS) {
      if (kinds.includes('open')) out.push({ kind: 'open', position: shover, stack });
      if (kinds.includes('call')) {
        for (const caller of callerPositions(shover)) out.push({ kind: 'call', shover, position: caller, stack });
      }
    }
  }
  return out;
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = rng() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function generateSpot(data: PushFoldData, rng: Rng, options: GeneratorOptions = {}): Spot {
  const kinds = options.kinds ?? ['open', 'call'];
  const minStack = options.minStack ?? MIN_STACK;
  const maxStack = options.maxStack ?? MAX_STACK;
  const randomShare = options.randomShare ?? DEFAULT_RANDOM_SHARE;

  const groups = new Map<CategoryKey, Situation[]>();
  for (const s of situations(kinds, minStack, maxStack)) {
    const key = categoryKey(s);
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size === 0) throw new Error('Keine Spots für diese Einstellungen');

  const keys = [...groups.keys()];
  const key = pickWeighted(keys, (k) => options.categoryWeights?.get(k) ?? 1, rng);
  const candidates = groups.get(key)!;
  const situation = candidates[Math.floor(rng() * candidates.length)];

  const hands = Array.from({ length: HAND_COUNT }, (_, h) => h);
  const evs = evRow(data, situation);
  const uniform = rng() < randomShare;
  const hand = pickWeighted(
    hands,
    (h) => (uniform ? COMBOS[h].length : COMBOS[h].length / (BOUNDARY_SOFTENING + Math.abs(evs[h]))),
    rng,
  );
  return { ...situation, hand };
}
