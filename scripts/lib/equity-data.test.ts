import { describe, expect, it } from 'vitest';
import { HAND_COUNT, parseHand } from '../../src/engine/cards';
import { loadEquity } from './equity-data';

describe('equity.json', () => {
  const m = loadEquity();
  const eq = (a: string, b: string) => m[parseHand(a) * HAND_COUNT + parseHand(b)];

  it('matches reference matchups within 1 percentage point', () => {
    expect(Math.abs(eq('AA', 'KK') - 0.82)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKs', 'QQ') - 0.46)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKo', '22') - 0.47)).toBeLessThan(0.01);
    expect(Math.abs(eq('72o', 'AA') - 0.12)).toBeLessThan(0.01);
  });

  it('is antisymmetric', () => {
    for (let i = 0; i < HAND_COUNT; i++) {
      for (let j = 0; j < HAND_COUNT; j++) {
        expect(m[i * HAND_COUNT + j] + m[j * HAND_COUNT + i]).toBeCloseTo(1, 3);
      }
    }
  });

  it('was computed with the final sample size', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const raw = readFileSync(fileURLToPath(new URL('../data/equity.json', import.meta.url)), 'utf8');
    expect((JSON.parse(raw) as { samples: number }).samples).toBeGreaterThanOrEqual(100_000);
  });
});
