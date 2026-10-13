import { describe, expect, it } from 'vitest';
import { chartFor } from '../engine/preflop/charts';
import { positionsOf } from './hand-model';
import { parseHand } from './parse';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';
import { villainStart } from './villain-range';

const FLOP = ['*** FLOP *** [2c 7d 9h]', 'Hero: checks'];
const start = (o: TestHandOptions) => {
  const hand = parseHand(ggHand(o));
  return villainStart(hand, positionsOf(hand)!);
};

describe('villainStart', () => {
  it('opener: the rfi range of his position', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    const s = start({ hero: 'BTN', lines });
    expect(s).toMatchObject({ villain: 'CO', position: 'CO', role: 'opener', chartKey: 'rfi:100:CO', part: 'aggressive', depth: 100, approximation: false });
    if (typeof s !== 'string') expect(s.flags).toEqual([...chartFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }).aggressive]);
  });

  it('caller against the hero open: the call part of vsOpen by his position group', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    expect(start({ hero: 'CO', lines })).toMatchObject({ villain: 'BTN', role: 'caller', chartKey: 'vsOpen:100:CO:ip', part: 'call' });
  });

  it('BB defence: vsOpen:…:bb', () => {
    const lines = [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220', 'SB: folds', 'BB: calls 120', ...FLOP];
    expect(start({ hero: 'BTN', lines })).toMatchObject({ villain: 'BB', role: 'bbDefender', chartKey: 'vsOpen:100:BTN:bb', part: 'call' });
  });

  it('3-bettor: the aggressive part of vsOpen', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: calls 440', ...FLOP];
    expect(start({ hero: 'CO', lines })).toMatchObject({ villain: 'BTN', role: 'threeBettor', chartKey: 'vsOpen:100:CO:ip', part: 'aggressive' });
  });

  it('caller against the hero 3-bet: the call part of vs3bet', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: raises 440 to 660', 'SB: folds', 'BB: folds', 'CO: calls 440', ...FLOP];
    expect(start({ hero: 'BTN', lines })).toMatchObject({ villain: 'CO', role: 'callerVs3bet', chartKey: 'vs3bet:100:CO:ip', part: 'call' });
  });

  it('maps the effective stack like the preflop rating: 40 BB chart, approximation, nothing up to 20 BB', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    expect(start({ hero: 'BTN', stacksBb: { BTN: 28 }, lines })).toMatchObject({ chartKey: 'rfi:40:CO', depth: 40, approximation: true });
    expect(start({ hero: 'BTN', stacksBb: { CO: 35 }, lines })).toMatchObject({ depth: 40, approximation: false });
    expect(start({ hero: 'BTN', stacksBb: { BTN: 18 }, lines })).toBe('shortRange');
  });

  it('names why there is no range: multiway, limp pot, 4-bet pot, cold 3-bet', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220'];
    expect(start({ hero: 'BTN', lines: [...open, 'Hero: calls 220', 'SB: folds', 'BB: calls 120', ...FLOP] })).toBe('multiwayPostflop');
    const limpers = ['UTG: calls 100', ...foldsBetween('UTG1', 'BTN'), 'Hero: calls 100', 'SB: folds', 'BB: checks', ...FLOP];
    expect(start({ hero: 'BTN', lines: limpers })).toBe('multiwayPostflop');
    expect(start({ hero: 'BB', lines: [...foldsBetween('UTG', 'SB'), 'SB: calls 50', 'Hero: checks', ...FLOP] })).toBe('limpRange');
    const fourBet = [...open, 'Hero: raises 440 to 660', 'SB: folds', 'BB: folds', 'CO: raises 900 to 1,560', 'Hero: calls 900', ...FLOP];
    expect(start({ hero: 'BTN', lines: fourBet })).toBe('deepRange');
    const cold = ['UTG: raises 120 to 220', ...foldsBetween('UTG1', 'BTN'), 'Hero: calls 220', 'SB: folds', 'BB: raises 500 to 720', 'UTG: folds', 'Hero: calls 500', ...FLOP];
    expect(start({ hero: 'BTN', lines: cold })).toBe('unknownRange');
  });
});
