import { describe, expect, it } from 'vitest';
import { currentStreak, dayProgress, incrementDay, localDateKey, shiftDateKey } from './streak';

describe('date keys', () => {
  it('uses the local calendar date', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('shifts across month and year boundaries', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateKey('2028-03-01', -1)).toBe('2028-02-29');
    expect(() => shiftDateKey('2026-3-1', 1)).toThrow();
  });
});

describe('incrementDay', () => {
  it('returns a new object and leaves the input untouched', () => {
    const days = { '2026-10-13': 3 };
    const next = incrementDay(days, '2026-10-13');
    expect(next).toEqual({ '2026-10-13': 4 });
    expect(days).toEqual({ '2026-10-13': 3 });
    expect(incrementDay({}, '2026-10-14', 5)).toEqual({ '2026-10-14': 5 });
  });
});

describe('currentStreak', () => {
  it('is 0 without training', () => {
    expect(currentStreak({}, '2026-10-13')).toBe(0);
  });

  it('counts today once 20 spots are reached', () => {
    expect(currentStreak({ '2026-10-13': 19 }, '2026-10-13')).toBe(0);
    expect(currentStreak({ '2026-10-13': 20 }, '2026-10-13')).toBe(1);
  });

  it('keeps yesterday\'s streak alive while today is unfinished', () => {
    const days = { '2026-10-11': 25, '2026-10-12': 20, '2026-10-13': 5 };
    expect(currentStreak(days, '2026-10-13')).toBe(2);
  });

  it('breaks on a missed day', () => {
    const days = { '2026-10-10': 30, '2026-10-12': 20, '2026-10-13': 20 };
    expect(currentStreak(days, '2026-10-13')).toBe(2);
    expect(currentStreak({ '2026-10-11': 20 }, '2026-10-13')).toBe(0);
  });
});

describe('dayProgress', () => {
  it('reports the daily target', () => {
    expect(dayProgress({ '2026-10-13': 7 }, '2026-10-13')).toEqual({ count: 7, target: 20, done: false });
    expect(dayProgress({ '2026-10-13': 21 }, '2026-10-13').done).toBe(true);
  });
});
