import { describe, expect, it } from 'vitest';
import { type PostflopSituation, judgePostflop } from './postflop-rules';

const base: PostflopSituation = { street: 'flop', action: 'call', equity: 30, needed: 30, betShare: null, outs: 0, chipsBehind: true, heroActsLast: false };
const judge = (over: Partial<PostflopSituation>) => judgePostflop({ ...base, ...over });

describe('judgePostflop (spec 7 rule table)', () => {
  it('call: mistake below needed − 10, questionable below needed − 3, else ok', () => {
    expect(judge({ equity: 19.9 })).toEqual({ verdict: 'mistake', reason: 'callTooWeak', bonus: 0 });
    expect(judge({ equity: 20 })).toEqual({ verdict: 'questionable', reason: 'callThin', bonus: 0 });
    expect(judge({ equity: 26.9 })).toMatchObject({ verdict: 'questionable' });
    expect(judge({ equity: 27 })).toEqual({ verdict: 'ok', reason: 'callOk', bonus: 0 });
  });

  it('call with a draw of 8+ outs gets 5 points on flop and turn, not on the river and not all-in', () => {
    expect(judge({ equity: 19, outs: 8 })).toEqual({ verdict: 'questionable', reason: 'callThin', bonus: 5 });
    expect(judge({ street: 'turn', equity: 22, outs: 9 })).toEqual({ verdict: 'ok', reason: 'callOk', bonus: 5 });
    expect(judge({ equity: 19, outs: 7 })).toMatchObject({ verdict: 'mistake', bonus: 0 });
    expect(judge({ street: 'river', equity: 19, outs: 8 })).toMatchObject({ verdict: 'mistake', bonus: 0 });
    expect(judge({ equity: 19, outs: 9, chipsBehind: false })).toMatchObject({ verdict: 'mistake', bonus: 0 });
  });

  it('fold: mistake above needed + 15, questionable above needed + 5, else ok', () => {
    expect(judge({ action: 'fold', equity: 45.1 })).toEqual({ verdict: 'mistake', reason: 'foldTooStrong', bonus: 0 });
    expect(judge({ action: 'fold', equity: 45 })).toEqual({ verdict: 'questionable', reason: 'foldThin', bonus: 0 });
    expect(judge({ action: 'fold', equity: 35.1 })).toMatchObject({ verdict: 'questionable' });
    expect(judge({ action: 'fold', equity: 35 })).toEqual({ verdict: 'ok', reason: 'foldOk', bonus: 0 });
  });

  it('raise or all-in: questionable below 35 % equity', () => {
    expect(judge({ action: 'raise', equity: 34.9 })).toEqual({ verdict: 'questionable', reason: 'raiseWeak', bonus: 0 });
    expect(judge({ action: 'allIn', equity: 20 })).toMatchObject({ verdict: 'questionable', reason: 'raiseWeak' });
    expect(judge({ action: 'raise', equity: 35 })).toEqual({ verdict: 'ok', reason: 'raiseOk', bonus: 0 });
  });

  it('bet: questionable below 20 % or above 150 % of the pot, and on the river with 35–55 % equity', () => {
    const bet = (betShare: number, over: Partial<PostflopSituation> = {}) => judge({ action: 'bet', needed: 0, equity: 60, betShare, ...over });
    expect(bet(0.19)).toEqual({ verdict: 'questionable', reason: 'betSize', bonus: 0 });
    expect(bet(1.51)).toMatchObject({ reason: 'betSize' });
    expect(bet(0.2)).toEqual({ verdict: 'ok', reason: 'betOk', bonus: 0 });
    expect(bet(1.5)).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'river', equity: 35 })).toEqual({ verdict: 'questionable', reason: 'riverBetMiddle', bonus: 0 });
    expect(bet(0.5, { street: 'river', equity: 55 })).toMatchObject({ reason: 'riverBetMiddle' });
    expect(bet(0.5, { street: 'river', equity: 55.1 })).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'river', equity: 10 })).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'turn', equity: 45 })).toMatchObject({ verdict: 'ok' });
  });

  it('check: questionable only on the river as the last to act with more than 75 % equity', () => {
    const check = (over: Partial<PostflopSituation>) => judge({ action: 'check', needed: 0, ...over });
    expect(check({ street: 'river', heroActsLast: true, equity: 75.1 })).toEqual({ verdict: 'questionable', reason: 'checkValue', bonus: 0 });
    expect(check({ street: 'river', heroActsLast: true, equity: 75 })).toEqual({ verdict: 'ok', reason: 'checkOk', bonus: 0 });
    expect(check({ street: 'river', heroActsLast: false, equity: 95 })).toMatchObject({ verdict: 'ok' });
    expect(check({ street: 'turn', heroActsLast: true, equity: 95 })).toMatchObject({ verdict: 'ok' });
  });
});
