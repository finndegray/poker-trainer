import { describe, expect, it } from 'vitest';
import { mulberry32, seedFromString } from './rng';

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashes strings stably', () => {
    expect(seedFromString('2026-10-13')).toBe(seedFromString('2026-10-13'));
    expect(seedFromString('2026-10-13')).not.toBe(seedFromString('2026-10-14'));
  });
});
