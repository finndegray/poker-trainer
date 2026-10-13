import { describe, expect, it } from 'vitest';
import { aggressiveActionOf, allowedActions, chartKeyFor, expectedChartKeys, sizesFor, validSituations } from './spots';

describe('preflop spots', () => {
  it('knows the actions per kind', () => {
    expect(aggressiveActionOf('rfi')).toBe('raise');
    expect(aggressiveActionOf('vsOpen')).toBe('threeBet');
    expect(aggressiveActionOf('vs3bet')).toBe('fourBet');
    expect(allowedActions('rfi')).toEqual(['raise', 'fold']);
    expect(allowedActions('vsOpen')).toEqual(['threeBet', 'call', 'fold']);
  });

  it('maps situations to grouped chart keys', () => {
    expect(chartKeyFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null })).toBe('rfi:100:CO');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 40, hero: 'BTN', villain: 'HJ' })).toBe('vsOpen:40:HJ:ip');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'SB', villain: 'CO' })).toBe('vsOpen:100:CO:sb');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB' })).toBe('vsOpen:100:SB:bb');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'UTG', villain: 'CO' })).toBe('vs3bet:100:UTG:ip');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 40, hero: 'BTN', villain: 'BB' })).toBe('vs3bet:40:BTN:blinds');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 40, hero: 'SB', villain: 'BB' })).toBe('vs3bet:40:SB:blinds');
  });

  it('rejects impossible situations', () => {
    expect(() => chartKeyFor({ kind: 'rfi', stack: 100, hero: 'BB', villain: null })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'UTG', villain: 'CO' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'CO', villain: 'BB' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'BB', villain: 'SB' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'HJ' })).toThrow(/Ungültiger Starthand-Spot/);
  });

  it('lists 37 chart keys per stack', () => {
    const keys = expectedChartKeys(100);
    expect(keys).toHaveLength(37);
    expect(keys.filter((k) => k.startsWith('rfi:'))).toHaveLength(7);
    expect(keys.filter((k) => k.startsWith('vsOpen:'))).toHaveLength(18);
    expect(keys.filter((k) => k.startsWith('vs3bet:'))).toHaveLength(12);
    expect(new Set(expectedChartKeys(40).map((k) => k.replace(':40:', ':100:')))).toEqual(new Set(keys));
  });

  it('enumerates every valid situation once', () => {
    const all = validSituations();
    expect(all.filter((s) => s.kind === 'rfi')).toHaveLength(14);
    expect(all.filter((s) => s.kind === 'vsOpen')).toHaveLength(56);
    expect(all.filter((s) => s.kind === 'vs3bet')).toHaveLength(56);
  });

  it('computes the fixed bet sizes', () => {
    expect(sizesFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null })).toEqual({ facing: null, aggressiveTo: 2.2 });
    expect(sizesFor({ kind: 'rfi', stack: 100, hero: 'SB', villain: null })).toEqual({ facing: null, aggressiveTo: 3 });
    expect(sizesFor({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' })).toEqual({ facing: 2.2, aggressiveTo: 6.6 });
    expect(sizesFor({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB' })).toEqual({ facing: 3, aggressiveTo: 12 });
    expect(sizesFor({ kind: 'vs3bet', stack: 100, hero: 'HJ', villain: 'BB' })).toEqual({ facing: 8.8, aggressiveTo: 19.4 });
    expect(sizesFor({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BTN' })).toEqual({ facing: 6.6, aggressiveTo: 40 });
  });
});
