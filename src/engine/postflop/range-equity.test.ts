import { describe, expect, it } from 'vitest';
import { parseCard } from '../cards';
import { parseRange } from '../preflop/ranges';
import { mulberry32 } from '../rng';
import { comboIndex, rangeFromClasses, removeCards } from './combos';
import { equityVsRange } from './range-equity';

const cards = (s: string) => s.split(' ').map(parseCard);
const hand = (s: string) => cards(s) as [number, number];
const range = (text: string, dead: string) => removeCards(rangeFromClasses(parseRange(text)), cards(dead));

describe('equityVsRange', () => {
  it('counts the river exactly, ties count half', () => {
    // A set of kings against AA and QQ: every combo loses.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 2c 9h 4s'), range('AA, QQ', 'Kh Kd Ks 7d 2c 9h 4s'), mulberry32(1), 0)).toBe(1);
    // Broadway on the board: everybody chops.
    expect(equityVsRange(hand('2h 3d'), cards('As Ks Qd Jc Th'), range('AA, 76s', '2h 3d As Ks Qd Jc Th'), mulberry32(1), 0)).toBe(0.5);
  });

  it('counts the turn exactly over every river card', () => {
    // A♥K♥ against 2♣2♦ on A♠ 7♦ 3♣ 9♥: only the two remaining deuces lose for the hero (44 river cards).
    const r = new Float64Array(1326);
    r[comboIndex(parseCard('2c'), parseCard('2d'))] = 1;
    expect(equityVsRange(hand('Ah Kh'), cards('As 7d 3c 9h'), r, mulberry32(1), 0)).toBeCloseTo(42 / 44, 9);
  });

  it('samples the flop with a fixed seed: same seed, same number, close to the exact value', () => {
    const villain = range('22', 'Ah Kh As 7d 3c');
    const a = equityVsRange(hand('Ah Kh'), cards('As 7d 3c'), villain, mulberry32(42), 4000);
    const b = equityVsRange(hand('Ah Kh'), cards('As 7d 3c'), villain, mulberry32(42), 4000);
    expect(a).toBe(b);
    // Exact: 22 needs a deuce (set) or runner-runner; about 91 % for top pair top kicker.
    expect(a!).toBeGreaterThan(0.88);
    expect(a!).toBeLessThan(0.94);
  });

  it('weights combos and returns null for an empty range', () => {
    const r = new Float64Array(1326);
    r[comboIndex(parseCard('Qc'), parseCard('Qd'))] = 3;
    r[comboIndex(parseCard('2c'), parseCard('3d'))] = 1;
    // Against QQ the hero (KK) wins, against 23 he wins: equity 1 either way on this river.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c 9h Js'), r, mulberry32(1), 0)).toBe(1);
    r[comboIndex(parseCard('2c'), parseCard('3d'))] = 0;
    r[comboIndex(parseCard('Tc'), parseCard('Td'))] = 1;
    // TT makes the straight 7-J: 3 parts QQ (lose to KKK) and 1 part TT (win) → 0.75.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c 9h Js'), r, mulberry32(1), 0)).toBe(0.75);
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c'), new Float64Array(1326), mulberry32(1), 100)).toBeNull();
  });
});
