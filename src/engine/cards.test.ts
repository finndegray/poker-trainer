import { describe, expect, it } from 'vitest';
import {
  COMBOS, HAND_COUNT, cardName, comboCount, compatMatrix, dealConcrete,
  handClassOf, handName, parseCard, parseHand, rankOf, suitOf,
} from './cards';
import { mulberry32 } from './rng';

describe('cards', () => {
  it('parses and names cards', () => {
    expect(parseCard('As')).toBe(12 * 4 + 3);
    expect(cardName(parseCard('Td'))).toBe('Td');
    expect(rankOf(parseCard('2c'))).toBe(0);
    expect(suitOf(parseCard('2h'))).toBe(2);
    expect(() => parseCard('Xx')).toThrow();
  });

  it('maps matrix layout to hand names', () => {
    expect(handName(0)).toBe('AA');
    expect(handName(1)).toBe('AKs');
    expect(handName(13)).toBe('AKo');
    expect(handName(168)).toBe('22');
    expect(parseHand('72o')).toBe(12 * 13 + 7);
    for (let h = 0; h < HAND_COUNT; h++) expect(parseHand(handName(h))).toBe(h);
  });

  it('classifies concrete cards', () => {
    expect(handName(handClassOf(parseCard('Ah'), parseCard('Kh')))).toBe('AKs');
    expect(handName(handClassOf(parseCard('Kd'), parseCard('Ah')))).toBe('AKo');
    expect(handName(handClassOf(parseCard('7c'), parseCard('7s')))).toBe('77');
  });

  it('has the right number of combos', () => {
    expect(comboCount(parseHand('AA'))).toBe(6);
    expect(comboCount(parseHand('AKs'))).toBe(4);
    expect(comboCount(parseHand('AKo'))).toBe(12);
    expect(COMBOS.reduce((sum, c) => sum + c.length, 0)).toBe(1326);
  });

  it('computes card-removal compatibility', () => {
    const m = compatMatrix();
    const aa = parseHand('AA');
    const kk = parseHand('KK');
    const aks = parseHand('AKs');
    expect(m[aa * 169 + kk]).toBe(6);
    expect(m[aa * 169 + aa]).toBe(1);
    expect(m[aa * 169 + aks]).toBe(2);
  });

  it('deals concrete cards of the requested class', () => {
    const rng = mulberry32(1);
    for (let h = 0; h < HAND_COUNT; h++) {
      const [a, b] = dealConcrete(h, rng);
      expect(handClassOf(a, b)).toBe(h);
    }
  });
});
