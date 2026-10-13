import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import { tableModel } from './table-model';

const hand = parseHand('A7o');

describe('tableModel', () => {
  it('models an open-shove spot', () => {
    const m = tableModel({ kind: 'open', position: 'CO', stack: 12, hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'hero', 'waiting', 'waiting', 'waiting']);
    expect(m.playersBehind).toBe(3);
    expect(m.potBb).toBe(2.5);
    expect(m.heroStackBb).toBe(12);
    const bb = m.seats[7];
    expect(bb).toMatchObject({ position: 'BB', betBb: 1, anteBb: 1, offset: 3 });
    expect(m.seats[6]).toMatchObject({ position: 'SB', betBb: 0.5, anteBb: 0 });
    expect(m.seats.filter((s) => s.isButton).map((s) => s.position)).toEqual(['BTN']);
    expect(m.seats[4].offset).toBe(0);
    expect(m.seats[1].label).toBe('UTG+1');
  });

  it('models a call spot', () => {
    const m = tableModel({ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'folded', 'shover', 'folded', 'hero']);
    expect(m.seats[5].betBb).toBe(12);
    expect(m.playersBehind).toBe(0);
    expect(m.potBb).toBe(14.5);
    expect(m.seats[0].offset).toBe(1);
  });
});
