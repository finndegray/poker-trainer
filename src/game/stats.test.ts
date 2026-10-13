import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import type { Spot, Verdict } from '../engine/pushfold';
import {
  accuracy, accuracyBy, adaptiveWeights, byKind, byPosition, byStackBucket, handErrorMatrix, weeklyTrend,
  type DecisionRecord,
} from './stats';

let ts = 0;
function rec(spot: Spot, verdict: Verdict, dateKey = '2026-10-13'): DecisionRecord {
  ts += 1;
  return { ts, dateKey, mode: 'training', spot, chosen: 'fold', verdict, responseMs: 3000 };
}
const btn = (stack: number, hand = 'A7o'): Spot => ({ kind: 'open', position: 'BTN', stack, hand: parseHand(hand) });
const bbCall = (stack: number, hand = 'K9o'): Spot => ({ kind: 'call', shover: 'SB', position: 'BB', stack, hand: parseHand(hand) });

describe('accuracy', () => {
  it('counts close decisions as correct', () => {
    expect(accuracy([])).toEqual({ correct: 0, total: 0, rate: null });
    expect(accuracy([rec(btn(10), 'correct'), rec(btn(10), 'close'), rec(btn(10), 'wrong'), rec(btn(10), 'wrong')]))
      .toEqual({ correct: 2, total: 4, rate: 0.5 });
  });

  it('groups by position, stack bucket and kind', () => {
    const records = [rec(btn(4), 'correct'), rec(btn(12), 'wrong'), rec(bbCall(12), 'correct')];
    expect(accuracyBy(records, byPosition).get('BTN')).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(accuracyBy(records, byPosition).get('BB')).toEqual({ correct: 1, total: 1, rate: 1 });
    expect(accuracyBy(records, byStackBucket).get('11-15')).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(accuracyBy(records, byKind).get('open')?.total).toBe(2);
  });
});

describe('handErrorMatrix', () => {
  it('counts totals and errors per hand class for one kind', () => {
    const m = handErrorMatrix(
      [rec(btn(10, 'A7o'), 'wrong'), rec(btn(8, 'A7o'), 'correct'), rec(bbCall(8, 'A7o'), 'wrong')],
      'open',
    );
    expect(m.total).toHaveLength(169);
    expect(m.total[parseHand('A7o')]).toBe(2);
    expect(m.errors[parseHand('A7o')]).toBe(1);
  });
});

describe('weeklyTrend', () => {
  it('returns 8 weeks, oldest first, the last one ending today', () => {
    const records = [
      rec(btn(10), 'correct', '2026-10-13'),
      rec(btn(10), 'wrong', '2026-10-07'),
      rec(btn(10), 'correct', '2026-10-06'),
      rec(btn(10), 'correct', '2026-08-01'),
    ];
    const trend = weeklyTrend(records, '2026-10-13');
    expect(trend).toHaveLength(8);
    expect(trend[7]).toEqual({ weekStart: '2026-10-07', weekEnd: '2026-10-13', accuracy: { correct: 1, total: 2, rate: 0.5 } });
    expect(trend[6]).toMatchObject({ weekStart: '2026-09-30', weekEnd: '2026-10-06', accuracy: { correct: 1, total: 1 } });
    expect(trend[0]).toMatchObject({ weekStart: '2026-08-19', weekEnd: '2026-08-25' });
    expect(trend.reduce((n, w) => n + w.accuracy.total, 0)).toBe(3);
  });
});

describe('adaptiveWeights', () => {
  it('boosts categories with a high error rate', () => {
    const records = [
      ...Array.from({ length: 4 }, () => rec(btn(10), 'wrong')),
      ...Array.from({ length: 4 }, () => rec(btn(10), 'correct')),
      ...Array.from({ length: 5 }, () => rec(bbCall(12), 'correct')),
    ];
    const w = adaptiveWeights(records);
    expect(w.get('open|BTN|6-10')).toBeCloseTo(3);
    expect(w.get('call|BB|11-15')).toBe(1);
    expect(w.has('open|UTG|1-5')).toBe(false);
  });

  it('only looks at the last 50 decisions of a category', () => {
    const old = Array.from({ length: 50 }, () => rec(btn(3), 'wrong'));
    const recent = Array.from({ length: 50 }, () => rec(btn(3), 'correct'));
    expect(adaptiveWeights([...old, ...recent]).get('open|BTN|1-5')).toBe(1);
    expect(adaptiveWeights([...recent.slice(0, 25), ...old.slice(0, 25)]).get('open|BTN|1-5')).toBeCloseTo(3);
  });
});
