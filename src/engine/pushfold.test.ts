import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { chart, evOf, grade } from './pushfold';
import { makeFixture } from './test-fixtures';

// EV = (84 - hand) / 10: hand 0 (AA) is +8.4, hand 84 is exactly 0, hand 168 (22) is -8.4.
const data = makeFixture((h, s) => (84 - h) / 10 + (s.kind === 'call' ? 0.05 : 0));

describe('evOf', () => {
  it('reads open-shove and call EVs', () => {
    expect(evOf(data, { kind: 'open', position: 'BTN', stack: 10, hand: 0 })).toBeCloseTo(8.4);
    expect(evOf(data, { kind: 'call', shover: 'BTN', position: 'BB', stack: 10, hand: 0 })).toBeCloseTo(8.45);
  });

  it('rejects invalid spots', () => {
    expect(() => evOf(data, { kind: 'open', position: 'BB', stack: 10, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'open', position: 'BTN', stack: 21, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'open', position: 'BTN', stack: 2.5, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'call', shover: 'BB', position: 'SB', stack: 10, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'call', shover: 'BTN', position: 'CO', stack: 10, hand: 0 })).toThrow();
  });

  it('rejects invalid hand indices', () => {
    const base = { kind: 'open', position: 'BTN', stack: 10 } as const;
    for (const hand of [-1, 169, 1.5, Number.NaN]) {
      expect(() => evOf(data, { ...base, hand })).toThrow(/Hand/);
    }
  });
});

describe('grade', () => {
  const open = { kind: 'open', position: 'CO', stack: 12 } as const;

  it('marks the higher-EV action as correct', () => {
    expect(grade(data, { ...open, hand: parseHand('AA') }, 'shove')).toMatchObject({ verdict: 'correct', best: 'shove' });
    expect(grade(data, { ...open, hand: parseHand('AA') }, 'fold')).toMatchObject({ verdict: 'wrong', best: 'shove' });
    expect(grade(data, { ...open, hand: 168 }, 'fold')).toMatchObject({ verdict: 'correct', best: 'fold' });
  });

  it('treats near-zero EV as close and accepts both answers', () => {
    expect(grade(data, { ...open, hand: 84 }, 'fold').verdict).toBe('close');
    expect(grade(data, { ...open, hand: 84 }, 'shove').verdict).toBe('close');
    expect(grade(data, { ...open, hand: 83 }, 'fold').verdict).toBe('wrong');
  });

  it('rejects actions that do not fit the spot', () => {
    expect(() => grade(data, { ...open, hand: 0 }, 'call')).toThrow();
    expect(() => grade(data, { kind: 'call', shover: 'CO', position: 'BB', stack: 12, hand: 0 }, 'shove')).toThrow();
  });
});

describe('grade evFold', () => {
  it('is always 0', () => {
    expect(grade(data, { kind: 'open', position: 'CO', stack: 12, hand: 0 }, 'shove').evFold).toBe(0);
    expect(grade(data, { kind: 'open', position: 'CO', stack: 12, hand: 168 }, 'fold').evFold).toBe(0);
  });
});

describe('chart', () => {
  it('classifies every hand', () => {
    const cells = chart(data, { kind: 'open', position: 'SB', stack: 8 });
    expect(cells).toHaveLength(169);
    expect(cells[0]).toBe('aggressive');
    expect(cells[84]).toBe('close-fold');
    expect(cells[168]).toBe('fold');
  });

  it('marks small positive EV as close-aggressive', () => {
    const cells = chart(data, { kind: 'call', shover: 'BTN', position: 'BB', stack: 8 });
    expect(cells[84]).toBe('close-aggressive');
    expect(cells[85]).toBe('close-fold');
  });
});
