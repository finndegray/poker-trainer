import { describe, expect, it } from 'vitest';
import { makeFixture } from '../engine/test-fixtures';
import { bestDaily, dailySpots, isBetterDaily, type DailyResult } from './daily';

const data = makeFixture((h) => (84 - h) / 10);

describe('dailySpots', () => {
  it('returns 20 spots that are identical for the same date', () => {
    const a = dailySpots(data, '2026-10-13');
    expect(a).toHaveLength(20);
    expect(dailySpots(data, '2026-10-13')).toEqual(a);
  });

  it('differs between dates', () => {
    expect(dailySpots(data, '2026-10-14')).not.toEqual(dailySpots(data, '2026-10-13'));
  });
});

describe('isBetterDaily / bestDaily', () => {
  const r = (correct: number, durationMs: number): DailyResult => ({ dateKey: '2026-10-13', correct, total: 20, durationMs });

  it('prefers more correct answers, then the faster time', () => {
    expect(isBetterDaily(r(15, 90_000), undefined)).toBe(true);
    expect(isBetterDaily(r(16, 120_000), r(15, 60_000))).toBe(true);
    expect(isBetterDaily(r(15, 60_000), r(15, 90_000))).toBe(true);
    expect(isBetterDaily(r(15, 90_000), r(15, 90_000))).toBe(false);
    expect(isBetterDaily(r(14, 10_000), r(15, 90_000))).toBe(false);
  });

  it('finds the best result', () => {
    expect(bestDaily([])).toBeUndefined();
    expect(bestDaily([r(12, 50_000), r(17, 99_000), r(17, 80_000)])).toEqual(r(17, 80_000));
  });
});
