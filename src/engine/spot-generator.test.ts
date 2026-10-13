import { describe, expect, it } from 'vitest';
import { COMBOS, parseHand } from './cards';
import { mulberry32 } from './rng';
import { categoryKey, generateSpot, stackBucketOf } from './spot-generator';
import { makeFixture } from './test-fixtures';

const data = makeFixture((h) => (84 - h) / 10);

describe('stackBucketOf', () => {
  it('maps stacks to buckets', () => {
    expect(stackBucketOf(1)).toBe('1-5');
    expect(stackBucketOf(5)).toBe('1-5');
    expect(stackBucketOf(6)).toBe('6-10');
    expect(stackBucketOf(15)).toBe('11-15');
    expect(stackBucketOf(20)).toBe('16-20');
    expect(() => stackBucketOf(0)).toThrow();
  });
});

describe('categoryKey', () => {
  it('uses kind, hero position and bucket', () => {
    expect(categoryKey({ kind: 'open', position: 'BTN', stack: 7 })).toBe('open|BTN|6-10');
    expect(categoryKey({ kind: 'call', shover: 'SB', position: 'BB', stack: 12 })).toBe('call|BB|11-15');
  });
});

describe('generateSpot', () => {
  it('is deterministic for the same seed', () => {
    const a = Array.from({ length: 20 }, ((rng) => () => generateSpot(data, rng))(mulberry32(5)));
    const b = Array.from({ length: 20 }, ((rng) => () => generateSpot(data, rng))(mulberry32(5)));
    expect(a).toEqual(b);
  });

  it('respects kinds and stack range', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const s = generateSpot(data, rng, { kinds: ['call'], minStack: 4, maxStack: 6 });
      expect(s.kind).toBe('call');
      expect(s.stack).toBeGreaterThanOrEqual(4);
      expect(s.stack).toBeLessThanOrEqual(6);
    }
  });

  it('draws boundary hands far more often than clear hands', () => {
    const rng = mulberry32(11);
    let boundary = 0;
    let aces = 0;
    for (let i = 0; i < 5000; i++) {
      const s = generateSpot(data, rng);
      if (Math.abs(s.hand - 84) <= 2) boundary++;
      if (s.hand === parseHand('AA')) aces++;
    }
    const comboShareBoundary = [82, 83, 84, 85, 86].reduce((n, h) => n + COMBOS[h].length, 0) / 1326;
    expect(boundary / 5000).toBeGreaterThan(comboShareBoundary * 3);
    expect(aces).toBeGreaterThan(0);
    expect(aces).toBeLessThan(boundary);
  });

  it('keeps a share of uniformly random hands', () => {
    const rng = mulberry32(13);
    let clearFolds = 0;
    for (let i = 0; i < 5000; i++) if (generateSpot(data, rng).hand >= 150) clearFolds++;
    expect(clearFolds).toBeGreaterThan(50);
  });

  it('favours categories with a higher weight', () => {
    const rng = mulberry32(17);
    const weights = new Map([['open|UTG|1-5', 20]]);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      if (categoryKey(generateSpot(data, rng, { categoryWeights: weights })) === 'open|UTG|1-5') hits++;
    }
    // 56 categories (28 open, 28 call); weight 20 gives about 20 / 75 = 27 %
    expect(hits / 2000).toBeGreaterThan(0.18);
  });
});

describe('generateSpot edge cases', () => {
  it('never produces the non-decision BB call at 1 BB', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 2000; i++) {
      const s = generateSpot(data, rng, { kinds: ['call'], minStack: 1, maxStack: 1 });
      expect(s.position).not.toBe('BB');
    }
  });

  it('keeps the call|BB|1-5 category for stacks 2-5', () => {
    const rng = mulberry32(4);
    const keys = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      keys.add(categoryKey(generateSpot(data, rng, { kinds: ['call'], minStack: 2, maxStack: 5 })));
    }
    expect(keys.has('call|BB|1-5')).toBe(true);
  });

  it('draws hands by combo share with randomShare 1', () => {
    const rng = mulberry32(11);
    const n = 5000;
    let high = 0;
    for (let i = 0; i < n; i++) if (generateSpot(data, rng, { randomShare: 1 }).hand >= 150) high++;
    let combos = 0;
    for (let h = 150; h < 169; h++) combos += COMBOS[h].length;
    expect(Math.abs(high / n - combos / 1326)).toBeLessThan(0.03);
  });

  it('rejects invalid category weights', () => {
    const rng = mulberry32(1);
    const w = (v: number) => new Map([['open|BTN|6-10', v]]);
    expect(() => generateSpot(data, rng, { categoryWeights: w(Number.NaN) })).toThrow(/Ungültiges (Gesamt)?[Gg]ewicht/);
    expect(() => generateSpot(data, rng, { categoryWeights: w(-1) })).toThrow(/Ungültiges (Gesamt)?[Gg]ewicht/);
    const zero = new Map([...['open', 'call'].flatMap((k) => ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'].flatMap((p) => ['1-5', '6-10', '11-15', '16-20'].map((b) => [`${k}|${p}|${b}`, 0] as const)))]);
    expect(() => generateSpot(data, rng, { categoryWeights: zero })).toThrow(/Ungültiges (Gesamt)?[Gg]ewicht/);
  });
});

