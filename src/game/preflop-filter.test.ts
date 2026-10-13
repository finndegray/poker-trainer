import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFLOP_FILTER, isPreflopFilter, preflopFilterOf, preflopSpotOptions, samePreflopFilter } from './preflop-filter';

describe('preflop filter', () => {
  it('accepts every combination of spot type and stack', () => {
    for (const kind of ['all', 'rfi', 'vsOpen', 'vs3bet']) {
      for (const stack of ['all', 40, 100]) expect(isPreflopFilter({ kind, stack })).toBe(true);
    }
  });

  it('rejects anything else', () => {
    const bad: unknown[] = [
      null, undefined, 'alle', [], {},
      { kind: 'squeeze', stack: 'all' },
      { kind: 'all', stack: 60 },
      { kind: 'all', stack: '40' },
      { kind: 'rfi' },
    ];
    for (const v of bad) expect(isPreflopFilter(v)).toBe(false);
  });

  it('defaults to all spots when the profile has no filter', () => {
    expect(DEFAULT_PREFLOP_FILTER).toEqual({ kind: 'all', stack: 'all' });
    expect(preflopFilterOf({})).toEqual(DEFAULT_PREFLOP_FILTER);
    expect(preflopFilterOf({ preflopFilter: { kind: 'rfi', stack: 40 } })).toEqual({ kind: 'rfi', stack: 40 });
  });

  it('turns a filter into spot options and compares filters', () => {
    expect(preflopSpotOptions({ kind: 'all', stack: 'all' })).toEqual({});
    expect(preflopSpotOptions({ kind: 'vs3bet', stack: 100 })).toEqual({ kinds: ['vs3bet'], stacks: [100] });
    expect(preflopSpotOptions({ kind: 'all', stack: 40 })).toEqual({ stacks: [40] });
    expect(samePreflopFilter({ kind: 'rfi', stack: 40 }, { kind: 'rfi', stack: 40 })).toBe(true);
    expect(samePreflopFilter({ kind: 'rfi', stack: 40 }, { kind: 'rfi', stack: 100 })).toBe(false);
  });
});
