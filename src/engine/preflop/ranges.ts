import { COMBOS, HAND_COUNT, type HandClass, RANKS, parseHand } from '../cards';

const R = '[2-9TJQKA]';
const PAIR_PLUS = new RegExp(`^(${R})\\1\\+$`);
const PAIR_SPAN = new RegExp(`^(${R})\\1-(${R})\\2$`);
const PAIR = new RegExp(`^(${R})\\1$`);
const PLUS = new RegExp(`^(${R})(${R})([so]?)\\+$`);
const SPAN = new RegExp(`^(${R})(${R})([so]?)-(${R})(${R})([so]?)$`);
const SINGLE = new RegExp(`^(${R})(${R})([so]?)$`);

const rankOf = (c: string): number => RANKS.indexOf(c);
const pair = (r: number): HandClass => parseHand(RANKS[r] + RANKS[r]);

function nonPair(hi: number, lo: number, suffix: string): HandClass[] {
  const suffixes = suffix ? [suffix] : ['s', 'o'];
  return suffixes.map((s) => parseHand(RANKS[hi] + RANKS[lo] + s));
}

function span(from: number, to: number): number[] {
  const out: number[] = [];
  for (let r = Math.min(from, to); r <= Math.max(from, to); r++) out.push(r);
  return out;
}

function expand(token: string): HandClass[] | null {
  let m = PAIR_PLUS.exec(token);
  if (m) return span(rankOf(m[1]), 12).map(pair);
  m = PAIR_SPAN.exec(token);
  if (m) return span(rankOf(m[1]), rankOf(m[2])).map(pair);
  m = PAIR.exec(token);
  if (m) return [pair(rankOf(m[1]))];
  m = PLUS.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    const lo = rankOf(m[2]);
    if (lo >= hi) return null;
    return span(lo, hi - 1).flatMap((l) => nonPair(hi, l, m![3]));
  }
  m = SPAN.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    if (m[4] !== m[1] || m[6] !== m[3]) return null;
    const a = rankOf(m[2]);
    const b = rankOf(m[5]);
    if (a >= hi || b >= hi) return null;
    return span(a, b).flatMap((l) => nonPair(hi, l, m![3]));
  }
  m = SINGLE.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    const lo = rankOf(m[2]);
    if (lo >= hi) return null;
    return nonPair(hi, lo, m[3]);
  }
  return null;
}

export function parseRange(text: string): boolean[] {
  const flags = new Array<boolean>(HAND_COUNT).fill(false);
  for (const raw of text.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const hands = expand(token);
    if (!hands) throw new Error(`Ungültiger Range-Eintrag: ${token}`);
    for (const h of hands) flags[h] = true;
  }
  return flags;
}

export function rangeHands(flags: readonly boolean[]): HandClass[] {
  const out: HandClass[] = [];
  flags.forEach((on, h) => {
    if (on) out.push(h);
  });
  return out;
}

export function rangeWidth(flags: readonly boolean[]): number {
  let combos = 0;
  flags.forEach((on, h) => {
    if (on) combos += COMBOS[h].length;
  });
  return combos / 1326;
}
