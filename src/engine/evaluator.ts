import { type Card, rankOf, suitOf } from './cards';

const BASE = 16;
const CATEGORY_FACTOR = BASE ** 5;

function score(category: number, ranks: readonly number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * BASE + (ranks[i] ?? 0);
  return v;
}

export const categoryOf = (s: number): number => Math.floor(s / CATEGORY_FACTOR);

// Highest rank of a 5-card straight inside a 13-bit rank mask, or -1. The wheel returns 3 (the Five).
function straightHigh(mask: number): number {
  const ext = (mask << 1) | ((mask >> 12) & 1);
  for (let hi = 13; hi >= 4; hi--) {
    if (((ext >> (hi - 4)) & 0x1f) === 0x1f) return hi - 1;
  }
  return -1;
}

function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

export function evaluate7(cards: ArrayLike<Card>): number {
  const counts = new Uint8Array(13);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = rankOf(cards[i]);
    const s = suitOf(cards[i]);
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitCount[s]++;
    mask |= 1 << r;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const sf = straightHigh(suitMask[s]);
      return sf >= 0 ? score(8, [sf]) : score(5, topRanks(suitMask[s], 5));
    }
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quad >= 0) return score(7, [quad, ...topRanks(mask & ~(1 << quad), 1)]);
  if (trips.length >= 2) return score(6, [trips[0], trips[1]]);
  if (trips.length === 1 && pairs.length >= 1) return score(6, [trips[0], pairs[0]]);

  const st = straightHigh(mask);
  if (st >= 0) return score(4, [st]);

  if (trips.length === 1) return score(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const rest = mask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return score(2, [pairs[0], pairs[1], ...topRanks(rest, 1)]);
  }
  if (pairs.length === 1) return score(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return score(0, topRanks(mask, 5));
}
