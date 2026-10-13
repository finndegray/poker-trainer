import { describe, expect, it } from 'vitest';
import { deserialize, emptyState, serialize, type SaveState } from '../storage/schema';
import {
  MAX_RETRAINING_DONE,
  MAX_RETRAINING_ENTRIES,
  byPlayedAt,
  type RetrainingCandidate,
  answerRetraining,
  forgetRetraining,
  isRetrainingTurn,
  pickRetraining,
  retrainingCount,
  retrainingOf,
  retrainingOn,
  setRetrainingOn,
  syncRetraining,
} from './retraining';

const open = (key: string, playedAt: string, hand = 130): RetrainingCandidate => ({
  key, playedAt, game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand },
});
const chart = (key: string, playedAt: string): RetrainingCandidate => ({
  key, playedAt, game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 },
});
const a = open('TM1:13', '2026-10-12 15:00:00');
const b = chart('TM2:15', '2026-10-12 16:00:00');
const c = open('TM3:9', '2026-10-11 20:00:00', 12);
const keys = (s: SaveState) => retrainingOf(s).entries.map((e) => e.key);

describe('syncRetraining', () => {
  it('leaves a save without queue untouched when there is nothing to queue', () => {
    const state = emptyState();
    expect(syncRetraining(state, '318096259', [])).toBe(state);
    expect(forgetRetraining(state, '318096259')).toBe(state);
  });

  it('queues the candidates of a tournament, oldest hand first, and marks it as fed', () => {
    const s = syncRetraining(emptyState(), 'T1', [a, b, c]);
    expect(keys(s)).toEqual(['TM3:9', 'TM1:13', 'TM2:15']);
    expect(retrainingOf(s).entries[1]).toEqual({ ...a, tournamentId: 'T1', streak: 0 });
    expect(retrainingOf(s).synced).toEqual(['T1']);
    expect(retrainingCount(s)).toBe(3);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('replaces only the spots of that tournament, keeps streaks of unchanged spots and never adds done keys', () => {
    let s = syncRetraining(emptyState(), 'T1', [a, b]);
    s = syncRetraining(s, 'T2', [c]);
    s = answerRetraining(s, 'TM1:13', 'correct');
    s = answerRetraining(s, 'TM2:15', 'correct');
    s = answerRetraining(s, 'TM2:15', 'correct');
    expect(retrainingOf(s).done).toEqual(['TM2:15']);
    s = syncRetraining(s, 'T1', [a, b, b]);
    expect(keys(s)).toEqual(['TM3:9', 'TM1:13']);
    expect(retrainingOf(s).entries[1].streak).toBe(1);
    // A changed spot (e.g. after a new rating) starts again at streak 0.
    s = syncRetraining(s, 'T1', [{ ...a, spot: { ...a.spot, hand: 131 } } as RetrainingCandidate]);
    expect(retrainingOf(s).entries[1]).toMatchObject({ key: 'TM1:13', streak: 0, spot: { hand: 131 } });
    // Kind changed to satellite: the tournament gives no candidates any more.
    s = syncRetraining(s, 'T1', []);
    expect(keys(s)).toEqual(['TM3:9']);
    expect(retrainingOf(s).synced).toEqual(['T1', 'T2']);
  });

  it('drops the oldest hands beyond 200 entries and remembers them as done', () => {
    const many = Array.from({ length: MAX_RETRAINING_ENTRIES + 5 }, (_, i) =>
      open(`TM${1000 + i}:5`, `2026-10-12 10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`),
    );
    const s = syncRetraining(emptyState(), 'T1', many);
    expect(retrainingCount(s)).toBe(MAX_RETRAINING_ENTRIES);
    expect(keys(s)[0]).toBe('TM1005:5');
    expect(retrainingOf(s).done).toEqual(['TM1000:5', 'TM1001:5', 'TM1002:5', 'TM1003:5', 'TM1004:5']);
    expect(keys(syncRetraining(s, 'T1', many))).toEqual(keys(s));
  });

  it('keeps at most 2000 done keys', () => {
    const done = Array.from({ length: MAX_RETRAINING_DONE }, (_, i) => `TM${i}:1`);
    let s: SaveState = { ...emptyState(), retraining: { entries: [], done, synced: [] } };
    s = syncRetraining(s, 'T1', [a]);
    s = answerRetraining(answerRetraining(s, a.key, 'correct'), a.key, 'close');
    expect(retrainingOf(s).done).toHaveLength(MAX_RETRAINING_DONE);
    expect(retrainingOf(s).done.at(-1)).toBe(a.key);
    expect(retrainingOf(s).done[0]).toBe('TM1:1');
  });
});

describe('syncRetraining details', () => {
  const deepFreeze = <T>(o: T): T => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(deepFreeze);
    }
    return o;
  };

  it('returns the same object when nothing changes, a new one when something does', () => {
    const s = syncRetraining(emptyState(), 'T1', [a, b]);
    expect(syncRetraining(s, 'T1', [a, b])).toBe(s);
    expect(syncRetraining(s, 'T1', [b, a])).toBe(s);
    expect(syncRetraining(s, 'T1', [a])).not.toBe(s);
    expect(syncRetraining(s, 'T1', [a, { ...b, playedAt: '2026-10-12 17:00:00' }])).not.toBe(s);
    expect(syncRetraining(s, 'T2', [])).not.toBe(s);
  });

  it('keeps the off switch', () => {
    const s = setRetrainingOn(syncRetraining(emptyState(), 'T1', [a]), false);
    const next = syncRetraining(s, 'T2', [c]);
    expect(retrainingOf(next).off).toBe(true);
    expect(keys(next)).toEqual(['TM3:9', 'TM1:13']);
    expect(retrainingOn(next)).toBe(false);
  });

  it('does not queue a key that is already queued under another tournament', () => {
    let s = syncRetraining(emptyState(), 'T1', [a]);
    s = syncRetraining(s, 'T2', [a, c]);
    expect(keys(s)).toEqual(['TM3:9', 'TM1:13']);
    expect(retrainingOf(s).entries.find((e) => e.key === a.key)?.tournamentId).toBe('T1');
  });

  it('does not mutate its inputs', () => {
    const s = deepFreeze(syncRetraining(emptyState(), 'T1', [a, b]));
    const cands = deepFreeze([c, { ...a }]);
    expect(() => syncRetraining(s, 'T2', cands)).not.toThrow();
    expect(() => syncRetraining(s, 'T1', [])).not.toThrow();
    expect(() => answerRetraining(s, a.key, 'correct')).not.toThrow();
    expect(() => forgetRetraining(s, 'T1')).not.toThrow();
    expect(() => setRetrainingOn(s, false)).not.toThrow();
  });

  it('never exposes a mutable shared empty state', () => {
    const e = retrainingOf(emptyState());
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.entries)).toBe(true);
    expect(Object.isFrozen(e.done)).toBe(true);
    expect(Object.isFrozen(e.synced)).toBe(true);
  });
});

describe('forgetRetraining', () => {
  it('keeps the off switch', () => {
    let s = setRetrainingOn(syncRetraining(emptyState(), 'T1', [a]), false);
    s = forgetRetraining(s, 'T1');
    expect(retrainingOf(s)).toMatchObject({ off: true, entries: [], synced: [] });
  });

  it('removes the spots of a deleted tournament but keeps done keys', () => {
    let s = syncRetraining(emptyState(), 'T1', [a, b]);
    s = syncRetraining(s, 'T2', [c]);
    s = answerRetraining(answerRetraining(s, b.key, 'correct'), b.key, 'correct');
    s = forgetRetraining(s, 'T1');
    expect(keys(s)).toEqual(['TM3:9']);
    expect(retrainingOf(s)).toMatchObject({ done: ['TM2:15'], synced: ['T2'] });
    expect(keys(syncRetraining(s, 'T1', [a, b]))).toEqual(['TM3:9', 'TM1:13']);
  });
});

describe('answerRetraining', () => {
  it('leaves the queue after two correct answers in a row; a wrong answer starts again', () => {
    let s = syncRetraining(emptyState(), 'T1', [a]);
    s = answerRetraining(s, a.key, 'correct');
    expect(retrainingOf(s).entries[0].streak).toBe(1);
    s = answerRetraining(s, a.key, 'wrong');
    expect(retrainingOf(s).entries[0].streak).toBe(0);
    s = answerRetraining(s, a.key, 'correct');
    s = answerRetraining(s, a.key, 'correct');
    expect(retrainingCount(s)).toBe(0);
    expect(retrainingOf(s).done).toEqual([a.key]);
  });

  it('ignores keys that are no longer queued', () => {
    const s = syncRetraining(emptyState(), 'T1', [a]);
    expect(answerRetraining(s, 'TM9:9', 'correct')).toBe(s);
    expect(answerRetraining(emptyState(), a.key, 'correct')).toEqual(emptyState());
  });
});

describe('switching the retraining off and on', () => {
  it('stores only the switch and keeps the queue', () => {
    const s = syncRetraining(emptyState(), 'T1', [a]);
    const off = setRetrainingOn(s, false);
    expect(retrainingOn(off)).toBe(false);
    expect(retrainingOf(off)).toMatchObject({ off: true, entries: [{ key: a.key }] });
    expect(pickRetraining(off, () => true, null)).toBeNull();
    expect(setRetrainingOn(off, false)).toBe(off);
    const on = setRetrainingOn(off, true);
    expect('off' in retrainingOf(on)).toBe(false);
    expect(retrainingOf(on).entries).toEqual(retrainingOf(s).entries);
    expect(setRetrainingOn(emptyState(), true)).toEqual(emptyState());
    expect(setRetrainingOn(emptyState(), false).retraining).toEqual({ off: true, entries: [], done: [], synced: [] });
  });
});

describe('pickRetraining', () => {
  it('draws fitting spots in turn, starting after the last one', () => {
    const s = syncRetraining(emptyState(), 'T1', [a, b, c]);
    const pushfold = (e: { game: string }) => e.game === 'pushfold';
    expect(pickRetraining(s, pushfold, null)?.key).toBe('TM3:9');
    expect(pickRetraining(s, pushfold, 'TM3:9')?.key).toBe('TM1:13');
    expect(pickRetraining(s, pushfold, 'TM1:13')?.key).toBe('TM3:9');
    expect(pickRetraining(s, pushfold, 'TM-weg:1')?.key).toBe('TM3:9');
    expect(pickRetraining(s, (e) => e.game === 'preflop', 'TM2:15')?.key).toBe('TM2:15');
    expect(pickRetraining(s, () => false, null)).toBeNull();
    expect(pickRetraining(emptyState(), () => true, null)).toBeNull();
  });

  it('makes every fourth deal a queue turn', () => {
    expect([1, 2, 3, 4, 5, 8, 12].map(isRetrainingTurn)).toEqual([false, false, false, true, false, true, true]);
    expect(isRetrainingTurn(0)).toBe(false);
  });
});

describe('byPlayedAt', () => {
  it('orders by plain code-unit comparison, independent of the device locale', () => {
    const x = { playedAt: '2026-10-12 15:00:00', key: 'TM1:1' };
    const upper = { playedAt: '2026-10-12 15:00:00', key: 'TMB:1' };
    const lower = { playedAt: '2026-10-12 15:00:00', key: 'TMa:1' };
    expect(byPlayedAt(x, { ...x, playedAt: '2026-10-12 15:00:01' })).toBeLessThan(0);
    // localeCompare would put 'a' before 'B'; code-unit order puts 'B' first.
    expect(byPlayedAt(upper, lower)).toBeLessThan(0);
    expect(byPlayedAt(lower, upper)).toBeGreaterThan(0);
    expect(byPlayedAt(x, { ...x })).toBe(0);
  });
});

describe('the written queue survives the save guard', () => {
  const stored = (s: SaveState) => deserialize(serialize(s)).retraining;
  it('after every function that changes the queue', () => {
    let s = syncRetraining(emptyState(), 'T1', [a, b]);
    expect(stored(s)).toEqual(s.retraining);
    s = syncRetraining(s, 'T2', [c]);
    expect(stored(s)).toEqual(s.retraining);
    s = answerRetraining(s, a.key, 'correct');
    expect(stored(s)).toEqual(s.retraining);
    s = answerRetraining(s, a.key, 'correct');
    expect(stored(s)).toEqual(s.retraining);
    s = forgetRetraining(s, 'T2');
    expect(stored(s)).toEqual(s.retraining);
    s = setRetrainingOn(s, false);
    expect(stored(s)).toEqual(s.retraining);
    s = setRetrainingOn(s, true);
    expect(stored(s)).toEqual(s.retraining);
    expect(retrainingCount(s)).toBe(1);
  });
});
