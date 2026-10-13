import { describe, expect, it } from 'vitest';
import { comboMultiplier, rankFor, xpForDecision } from './xp';

describe('xpForDecision', () => {
  it('gives nothing for a mistake and resets the combo', () => {
    expect(xpForDecision('wrong', 1000, 7)).toEqual({ xp: 0, combo: 0, multiplier: 1 });
  });

  it('gives base XP and a speed bonus', () => {
    expect(xpForDecision('correct', 6000, 0)).toEqual({ xp: 10, combo: 1, multiplier: 1 });
    expect(xpForDecision('correct', 4999, 0)).toEqual({ xp: 15, combo: 1, multiplier: 1 });
    expect(xpForDecision('correct', 5000, 0).xp).toBe(10);
  });

  it('treats close decisions like correct ones', () => {
    expect(xpForDecision('close', 2000, 2)).toEqual({ xp: 15, combo: 3, multiplier: 1 });
  });

  it('applies the combo multiplier from the 5th and 10th answer in a row', () => {
    expect(xpForDecision('correct', 6000, 3)).toMatchObject({ xp: 10, combo: 4 });
    expect(xpForDecision('correct', 1000, 4)).toEqual({ xp: 23, combo: 5, multiplier: 1.5 });
    expect(xpForDecision('correct', 6000, 9)).toEqual({ xp: 20, combo: 10, multiplier: 2 });
    expect(comboMultiplier(25)).toBe(2);
  });
});

describe('rankFor', () => {
  it('maps XP to ranks with progress', () => {
    expect(rankFor(0)).toEqual({ name: 'Fish', minXp: 0, next: { name: 'Donkey', minXp: 500 }, progress: 0 });
    expect(rankFor(499).name).toBe('Fish');
    expect(rankFor(500).name).toBe('Donkey');
    expect(rankFor(1250).progress).toBeCloseTo(0.5);
    expect(rankFor(6000).name).toBe('Reg');
    expect(rankFor(15000).name).toBe('Shark');
  });

  it('caps at Crusher', () => {
    expect(rankFor(99999)).toEqual({ name: 'Crusher', minXp: 40000, next: null, progress: 1 });
  });

  it('rejects invalid XP', () => {
    expect(() => rankFor(-1)).toThrow();
    expect(() => rankFor(Number.NaN)).toThrow();
  });
});
