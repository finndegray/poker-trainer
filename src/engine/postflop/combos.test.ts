import { describe, expect, it } from 'vitest';
import { parseCard, rankOf } from '../cards';
import { parseRange } from '../preflop/ranges';
import { COMBO_A, COMBO_B, COMBO_COUNT, comboIndex, keepShare, rangeFromClasses, rangeWeight, removeCards } from './combos';

const c = parseCard;

describe('combo ranges', () => {
  it('numbers all 1326 combos in both card orders', () => {
    expect(COMBO_COUNT).toBe(1326);
    const i = comboIndex(c('Ah'), c('Kd'));
    expect(comboIndex(c('Kd'), c('Ah'))).toBe(i);
    expect([COMBO_A[i], COMBO_B[i]].sort()).toEqual([c('Ah'), c('Kd')].sort());
  });

  it('expands hand classes to combos with weight 1', () => {
    const range = rangeFromClasses(parseRange('AA, AKs, AKo'));
    expect(rangeWeight(range)).toBe(6 + 4 + 12);
    expect(range[comboIndex(c('Ah'), c('Kh'))]).toBe(1);
    expect(range[comboIndex(c('Kh'), c('Qh'))]).toBe(0);
  });

  it('removes combos that hold a known card (card removal)', () => {
    const range = removeCards(rangeFromClasses(parseRange('AA, KK')), [c('As'), c('Kd'), c('Kh')]);
    // AA: 3 of 6 combos without the A♠; KK: only K♣K♠ is left.
    expect(rangeWeight(range)).toBe(3 + 1);
    expect(range[comboIndex(c('Kc'), c('Ks'))]).toBe(1);
  });

  it('keeps exactly the strongest share and splits a tie group evenly', () => {
    const range = rangeFromClasses(parseRange('AA, KK'));
    const strength = new Float64Array(COMBO_COUNT);
    for (let i = 0; i < COMBO_COUNT; i++) strength[i] = rankOf(COMBO_A[i]) === 12 ? 2 : 1;
    // 12 combos: 6 × AA (strength 2), 6 × KK (strength 1). The strongest 75 % = 9 combos: all AA, half of every KK.
    const kept = keepShare(range, strength, 0.75, 'strong');
    expect(rangeWeight(kept)).toBeCloseTo(9, 9);
    expect(kept[comboIndex(c('Ah'), c('As'))]).toBe(1);
    expect(kept[comboIndex(c('Kh'), c('Ks'))]).toBeCloseTo(0.5, 9);
    // The weakest 25 % = 3 combos: half of every KK, no AA.
    const weak = keepShare(range, strength, 0.25, 'weak');
    expect(rangeWeight(weak)).toBeCloseTo(3, 9);
    expect(weak[comboIndex(c('Ah'), c('As'))]).toBe(0);
  });

  it('keeps reduced weights in proportion when it narrows again', () => {
    const range = rangeFromClasses(parseRange('AA'));
    const flat = new Float64Array(COMBO_COUNT).fill(1);
    const twice = keepShare(keepShare(range, flat, 0.5, 'strong'), flat, 0.5, 'strong');
    expect(rangeWeight(twice)).toBeCloseTo(1.5, 9);
  });
});
