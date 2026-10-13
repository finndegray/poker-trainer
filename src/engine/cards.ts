import type { Rng } from './rng';

export type Card = number;
export type HandClass = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const HAND_COUNT = 169;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const cardName = (c: Card): string => RANKS[rankOf(c)] + SUITS[suitOf(c)];

export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0] ?? '');
  const su = SUITS.indexOf(s[1] ?? '');
  if (s.length !== 2 || r < 0 || su < 0) throw new Error(`Ungültige Karte: ${s}`);
  return r * 4 + su;
}

// Matrix index 0 is the Ace, 12 the Deuce.
const toMatrix = (rank: number): number => 12 - rank;

export function handName(h: HandClass): string {
  const row = Math.floor(h / 13);
  const col = h % 13;
  const hi = RANKS[12 - Math.min(row, col)];
  const lo = RANKS[12 - Math.max(row, col)];
  if (row === col) return hi + lo;
  return hi + lo + (row < col ? 's' : 'o');
}

export function parseHand(name: string): HandClass {
  const hi = RANKS.indexOf(name[0] ?? '');
  const lo = RANKS.indexOf(name[1] ?? '');
  if (hi < 0 || lo < 0) throw new Error(`Ungültige Hand: ${name}`);
  if (hi === lo) {
    if (name.length !== 2) throw new Error(`Ungültige Hand: ${name}`);
    return toMatrix(hi) * 13 + toMatrix(hi);
  }
  const suffix = name[2];
  if (hi < lo || name.length !== 3 || (suffix !== 's' && suffix !== 'o')) {
    throw new Error(`Ungültige Hand: ${name}`);
  }
  return suffix === 's'
    ? toMatrix(hi) * 13 + toMatrix(lo)
    : toMatrix(lo) * 13 + toMatrix(hi);
}

export function handClassOf(a: Card, b: Card): HandClass {
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  if (hi === lo) return toMatrix(hi) * 13 + toMatrix(hi);
  return suitOf(a) === suitOf(b)
    ? toMatrix(hi) * 13 + toMatrix(lo)
    : toMatrix(lo) * 13 + toMatrix(hi);
}

function buildCombos(): Array<Array<readonly [Card, Card]>> {
  const out: Array<Array<readonly [Card, Card]>> = Array.from({ length: HAND_COUNT }, () => []);
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) out[handClassOf(a, b)].push([a, b] as const);
  }
  return out;
}

export const COMBOS: ReadonlyArray<ReadonlyArray<readonly [Card, Card]>> = buildCombos();

export const comboCount = (h: HandClass): number => COMBOS[h].length;

let compatCache: Float64Array | null = null;

export function compatMatrix(): Float64Array {
  if (compatCache) return compatCache;
  const m = new Float64Array(HAND_COUNT * HAND_COUNT);
  for (let i = 0; i < HAND_COUNT; i++) {
    for (let j = 0; j < HAND_COUNT; j++) {
      let total = 0;
      for (const [a1, a2] of COMBOS[i]) {
        for (const [b1, b2] of COMBOS[j]) {
          if (b1 !== a1 && b1 !== a2 && b2 !== a1 && b2 !== a2) total++;
        }
      }
      m[i * HAND_COUNT + j] = total / COMBOS[i].length;
    }
  }
  compatCache = m;
  return m;
}

export function dealConcrete(h: HandClass, rng: Rng): readonly [Card, Card] {
  const combos = COMBOS[h];
  return combos[Math.floor(rng() * combos.length)];
}
