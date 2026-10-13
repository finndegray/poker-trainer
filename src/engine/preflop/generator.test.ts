import { describe, expect, it } from 'vitest';
import { COMBOS, parseHand } from '../cards';
import { mulberry32 } from '../rng';
import { chartFor } from './charts';
import { boundaryHands, generatePreflopSpot, preflopCategoryKey } from './generator';

describe('boundaryHands', () => {
  it('marks close hands and hands next to a different action', () => {
    const b = boundaryHands(chartFor({ kind: 'rfi', stack: 100, hero: 'UTG', villain: null }));
    expect(b[parseHand('44')]).toBe(true);
    expect(b[parseHand('K8s')]).toBe(true);
    expect(b[parseHand('AA')]).toBe(false);
    expect(b[parseHand('72o')]).toBe(false);
  });
});

describe('generatePreflopSpot', () => {
  it('is deterministic per seed', () => {
    const run = () => {
      const rng = mulberry32(3);
      return Array.from({ length: 30 }, () => generatePreflopSpot(rng));
    };
    expect(run()).toEqual(run());
  });

  it('respects kind and stack filters', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const s = generatePreflopSpot(rng, { kinds: ['vs3bet'], stacks: [40] });
      expect(s.kind).toBe('vs3bet');
      expect(s.stack).toBe(40);
      expect(s.villain).not.toBeNull();
    }
    expect(() => generatePreflopSpot(rng, { kinds: [] })).toThrow('Keine Starthand-Spots für diese Filter');
  });

  it('prefers boundary hands', () => {
    const rng = mulberry32(7);
    let boundary = 0;
    let boundaryCombos = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = generatePreflopSpot(rng, { kinds: ['rfi'], stacks: [100] });
      const b = boundaryHands(chartFor(s));
      if (b[s.hand]) boundary++;
      boundaryCombos += b.reduce((sum, on, h) => sum + (on ? COMBOS[h].length : 0), 0) / 1326;
    }
    expect(boundary / n).toBeGreaterThan((boundaryCombos / n) * 2);
  });

  it('weights categories', () => {
    const rng = mulberry32(9);
    const weights = new Map([['rfi|UTG|100', 30]]);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      if (preflopCategoryKey(generatePreflopSpot(rng, { stacks: [100], categoryWeights: weights })) === 'rfi|UTG|100') hits++;
    }
    expect(hits / 2000).toBeGreaterThan(0.2);
  });

  it('rejects an invalid random share', () => {
    const rng = mulberry32(1);
    for (const bad of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => generatePreflopSpot(rng, { randomShare: bad })).toThrow(`Ungültiger Zufallsanteil: ${bad}`);
    }
    expect(() => generatePreflopSpot(rng, { randomShare: 0 })).not.toThrow();
    expect(() => generatePreflopSpot(rng, { randomShare: 1 })).not.toThrow();
  });

  it('rejects invalid weights', () => {
    const rng = mulberry32(1);
    expect(() => generatePreflopSpot(rng, { categoryWeights: new Map([['rfi|UTG|100', -1]]) })).toThrow('Ungültiges Gewicht');
  });
});
