import { describe, expect, it } from 'vitest';
import { parseHand } from '../cards';
import { chartFor } from './charts';
import { comparePreflopPositions, gradePreflop, preflopActionWord, preflopCells } from './grading';

const hand = parseHand;

describe('gradePreflop', () => {
  const utg = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null } as const;

  it('grades main actions and close alternatives', () => {
    expect(gradePreflop({ ...utg, hand: hand('AA') }, 'raise')).toEqual({ verdict: 'correct', chosen: 'raise', best: 'raise', alternative: null });
    expect(gradePreflop({ ...utg, hand: hand('AA') }, 'fold')).toMatchObject({ verdict: 'wrong', best: 'raise' });
    expect(gradePreflop({ ...utg, hand: hand('44') }, 'fold')).toEqual({ verdict: 'close', chosen: 'fold', best: 'raise', alternative: 'fold' });
    expect(gradePreflop({ ...utg, hand: hand('44') }, 'raise').verdict).toBe('correct');
    expect(gradePreflop({ ...utg, hand: hand('72o') }, 'fold').verdict).toBe('correct');
  });

  it('grades calls against an open', () => {
    const spot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG', hand: hand('JJ') } as const;
    expect(gradePreflop(spot, 'call').verdict).toBe('correct');
    expect(gradePreflop(spot, 'threeBet')).toMatchObject({ verdict: 'wrong', best: 'call' });
  });

  it('rejects actions that do not fit and invalid hands', () => {
    expect(() => gradePreflop({ ...utg, hand: hand('AA') }, 'call')).toThrow('Aktion call passt nicht zum Spot');
    expect(() => gradePreflop({ ...utg, hand: 169 }, 'fold')).toThrow('Ungültiger Hand-Index: 169');
  });
});

describe('preflopCells and words', () => {
  it('classifies every hand of a chart', () => {
    const cells = preflopCells(chartFor({ kind: 'rfi', stack: 100, hero: 'UTG', villain: null }));
    expect(cells).toHaveLength(169);
    expect(cells[hand('AA')]).toBe('aggressive');
    expect(cells[hand('44')]).toBe('close');
    expect(cells[hand('72o')]).toBe('fold');
    expect(preflopCells(chartFor({ kind: 'vsOpen', stack: 100, hero: 'CO', villain: 'UTG' }))[hand('JJ')]).toBe('call');
  });

  it('names the actions', () => {
    expect(preflopActionWord('raise', 100)).toBe('Raise');
    expect(preflopActionWord('threeBet', 40)).toBe('3-Bet');
    expect(preflopActionWord('fourBet', 100)).toBe('4-Bet');
    expect(preflopActionWord('fourBet', 40)).toBe('All-in');
    expect(preflopActionWord('call', 40)).toBe('Call');
  });
});

describe('comparePreflopPositions', () => {
  it('compares open-raises across positions', () => {
    const r = comparePreflopPositions({ kind: 'rfi', stack: 100, hero: 'CO', villain: null, hand: hand('A9o') });
    expect(r.axis).toBe('hero');
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.filter((e) => e.isCurrent).map((e) => e.position)).toEqual(['CO']);
    expect(r.summary).toBe('A9o (100 BB, Open-Raise): Fold aus UTG bis LJ, knapp aus HJ, Raise ab CO');
  });

  it('compares a big-blind defence across openers', () => {
    const r = comparePreflopPositions({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'HJ', hand: hand('KJo') });
    expect(r.axis).toBe('opener');
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.find((e) => e.isCurrent)?.position).toBe('HJ');
    expect(r.summary).toBe('KJo (100 BB, gegen Open-Raise, du im BB): knapp gegen UTG bis UTG+1, Call gegen LJ bis BTN, 3-Bet gegen SB');
  });

  it('compares 3-bet defences from the blinds across own positions', () => {
    const r = comparePreflopPositions({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'SB', hand: hand('AJo') });
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.summary).toBe('AJo (40 BB, gegen 3-Bet aus den Blinds): Fold aus UTG bis HJ, knapp aus CO, All-in ab BTN');
  });

  it('uses "aus jeder Position" when every position agrees', () => {
    const r = comparePreflopPositions({ kind: 'rfi', stack: 40, hero: 'UTG', villain: null, hand: hand('AA') });
    expect(r.summary).toBe('AA (40 BB, Open-Raise): Raise aus jeder Position');
  });
});
