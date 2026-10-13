import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { sampleClassEquity } from './equity';
import { mulberry32 } from './rng';

const eq = (a: string, b: string) =>
  sampleClassEquity(parseHand(a), parseHand(b), 40_000, mulberry32(7));

describe('sampleClassEquity', () => {
  it('matches well-known preflop matchups within 1 percentage point', () => {
    expect(Math.abs(eq('AA', 'KK') - 0.82)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKs', 'QQ') - 0.46)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKo', '22') - 0.47)).toBeLessThan(0.01);
    expect(Math.abs(eq('72o', 'AA') - 0.12)).toBeLessThan(0.01);
  });

  it('is about even for identical classes', () => {
    expect(Math.abs(eq('T9s', 'T9s') - 0.5)).toBeLessThan(0.01);
  });
});
