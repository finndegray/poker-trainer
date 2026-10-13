import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { comparePositions } from './position-compare';
import { seatOf } from './positions';
import { cellForEv } from './pushfold';
import { makeFixture } from './test-fixtures';

const a7o = parseHand('A7o');

describe('cellForEv', () => {
  it('classifies EVs like the chart', () => {
    expect(cellForEv(1)).toBe('aggressive');
    expect(cellForEv(-1)).toBe('fold');
    expect(cellForEv(0.05)).toBe('close-aggressive');
    expect(cellForEv(0)).toBe('close-fold');
    expect(cellForEv(-0.05)).toBe('close-fold');
  });
});

describe('comparePositions', () => {
  // Open: UTG..HJ negative, CO..SB positive. Call: SB negative, BB positive.
  const data = makeFixture((_, s) =>
    s.kind === 'open' ? seatOf(s.position) - 3.5 : seatOf(s.position) - 6.5,
  );

  it('lists every open position with the hero marked', () => {
    const r = comparePositions(data, { kind: 'open', position: 'CO', stack: 12, hand: a7o });
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.filter((e) => e.isHero).map((e) => e.position)).toEqual(['CO']);
    expect(r.entries[0]).toMatchObject({ cell: 'fold', ev: -3.5 });
    expect(r.summary).toBe('A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO');
  });

  it('compares callers behind the same shover', () => {
    const r = comparePositions(data, { kind: 'call', shover: 'BTN', position: 'BB', stack: 8, hand: a7o });
    expect(r.entries.map((e) => e.position)).toEqual(['SB', 'BB']);
    expect(r.summary).toBe('A7o bei 8 BB gegen Shove aus BTN: Fold aus SB, Call aus BB');
  });

  it('groups close decisions as "knapp"', () => {
    const close = makeFixture((_, s) => seatOf(s.position) - 3);
    const r = comparePositions(close, { kind: 'open', position: 'UTG1', stack: 10, hand: a7o });
    expect(r.summary).toBe('A7o bei 10 BB: Fold aus UTG bis LJ, knapp aus HJ, Push ab CO');
  });

  it('uses "aus jeder Position" when all positions agree', () => {
    const all = makeFixture(() => 2);
    const r = comparePositions(all, { kind: 'open', position: 'UTG', stack: 5, hand: parseHand('AA') });
    expect(r.summary).toBe('AA bei 5 BB: Push aus jeder Position');
  });
});
