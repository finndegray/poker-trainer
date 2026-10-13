import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import { preflopTableModel, tableModel } from './table-model';

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

describe('preflopTableModel', () => {
  it('models a decision against an open-raise', () => {
    const m = preflopTableModel({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'raiser', 'hero', 'waiting', 'waiting']);
    expect(m.seats[4]).toMatchObject({ position: 'CO', betBb: 2.2, betLabel: 'Raise', stackBb: 97.8 });
    expect(m.seats[5]).toMatchObject({ position: 'BTN', betBb: 0, betLabel: null, stackBb: 100, offset: 0 });
    expect(m.seats[6]).toMatchObject({ position: 'SB', betBb: 0.5, betLabel: null, stackBb: null });
    expect(m.seats[7]).toMatchObject({ position: 'BB', betBb: 1, anteBb: 1 });
    expect(m.playersBehind).toBe(2);
    expect(m.potBb).toBe(4.7);
    expect(m.heroStackBb).toBe(100);
  });

  it('models a decision against a 3-bet', () => {
    const m = preflopTableModel({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'hero', 'raiser', 'folded', 'folded']);
    expect(m.seats[4]).toMatchObject({ betBb: 2.2, betLabel: null, stackBb: 97.8 });
    expect(m.seats[5]).toMatchObject({ betBb: 6.6, betLabel: '3-Bet', stackBb: 93.4 });
    expect(m.seats[6].betBb).toBe(0.5);
    expect(m.potBb).toBe(11.3);
    expect(m.playersBehind).toBe(0);
  });

  it('models an open from the small blind and a blind-versus-blind defence', () => {
    const rfi = preflopTableModel({ kind: 'rfi', stack: 40, hero: 'SB', villain: null, hand });
    expect(rfi.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'folded', 'folded', 'hero', 'waiting']);
    expect(rfi.seats[6]).toMatchObject({ betBb: 0.5, stackBb: 39.5 });
    expect(rfi.potBb).toBe(2.5);
    expect(rfi.playersBehind).toBe(1);
    const bvb = preflopTableModel({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB', hand });
    expect(bvb.seats[6]).toMatchObject({ role: 'raiser', betBb: 3, betLabel: 'Raise', stackBb: 97 });
    expect(bvb.seats[7]).toMatchObject({ role: 'hero', betBb: 1, stackBb: 99 });
    expect(bvb.potBb).toBe(5);
    expect(bvb.playersBehind).toBe(0);
  });

  it('labels the push/fold shover and shows no stacks there', () => {
    const m = tableModel({ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand });
    expect(m.seats[5]).toMatchObject({ betLabel: 'All-in', stackBb: null });
    expect(m.seats.filter((s) => s.betLabel !== null)).toHaveLength(1);
    expect(m.seats.every((s) => s.stackBb === null)).toBe(true);
  });
});
