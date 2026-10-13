import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import { generatePreflopSpot } from '../engine/preflop/generator';
import type { PreflopSpot } from '../engine/preflop/spots';
import type { Spot } from '../engine/pushfold';
import { makeFixture } from '../engine/test-fixtures';
import { mulberry32 } from '../engine/rng';
import { generateSpot } from '../engine/spot-generator';
import { MAX_DECISIONS, MAX_RUNS, emptyState, type RunSummary, type SaveState } from '../storage/schema';
import { deserialize, serialize } from '../storage/schema';
import { loadState, memoryBackend, saveState } from '../storage/store';
import type { PreflopFilter } from './preflop-filter';
import { applyRunAnswer, startRun, type RunState } from './endphase-run';
import {
  answerActiveRun, nextPreflopTrainingSpot, nextTrainingSpot, recordDaily, recordDecision, recordPreflopDecision, recordRun, setSound, startActiveRun, statusOf,
} from './session';
import { adaptiveWeights, preflopAdaptiveWeights } from './stats';

const data = makeFixture((h) => (84 - h) / 10);
const now = new Date(2026, 9, 13, 20, 0);
const aaOnBtn: Spot = { kind: 'open', position: 'BTN', stack: 10, hand: parseHand('AA') };
const finish = (verdicts: Array<'correct' | 'wrong'>): RunState => verdicts.reduce(applyRunAnswer, startRun());

describe('recordDecision', () => {
  it('grades, awards XP, counts the day and logs the decision without mutating the input', () => {
    const before = emptyState();
    const out = recordDecision(data, before, { spot: aaOnBtn, chosen: 'shove', responseMs: 1200, mode: 'training', now });
    expect(out.grade.verdict).toBe('correct');
    expect(out.xp).toEqual({ xp: 15, combo: 1, multiplier: 1 });
    expect(out.state.profile).toEqual({ xp: 15, combo: 1, soundOn: true });
    expect(out.state.days).toEqual({ '2026-10-13': 1 });
    expect(out.state.decisions).toEqual([out.record]);
    expect(out.record).toMatchObject({ dateKey: '2026-10-13', mode: 'training', chosen: 'shove', verdict: 'correct', responseMs: 1200 });
    expect(before).toEqual(emptyState());
  });

  it('resets the combo on a mistake', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 100, combo: 6, soundOn: true } };
    const out = recordDecision(data, state, { spot: aaOnBtn, chosen: 'fold', responseMs: 900, mode: 'run', now });
    expect(out.grade.verdict).toBe('wrong');
    expect(out.state.profile).toMatchObject({ xp: 100, combo: 0 });
  });

  it('reports a rank-up', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const out = recordDecision(data, state, { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    expect(out.rank).toEqual({ before: 'Fish', after: 'Donkey', rankUp: true });
  });

  it('keeps at most MAX_DECISIONS decisions', () => {
    const first = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    const full: SaveState = { ...emptyState(), decisions: Array.from({ length: MAX_DECISIONS }, () => first.record) };
    const out = recordDecision(data, full, { spot: aaOnBtn, chosen: 'fold', responseMs: 1000, mode: 'training', now });
    expect(out.state.decisions).toHaveLength(MAX_DECISIONS);
    expect(out.state.decisions[MAX_DECISIONS - 1]).toBe(out.record);
  });
});

describe('recordDaily', () => {
  const result = (correct: number) => ({ dateKey: '2026-10-13', correct, total: 20, durationMs: 70_000 });

  it('accepts one result per day', () => {
    const first = recordDaily(emptyState(), result(15));
    expect(first).toMatchObject({ accepted: true, isPersonalBest: true });
    const second = recordDaily(first.state, result(19));
    expect(second.accepted).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('flags personal bests across days', () => {
    const day1 = recordDaily(emptyState(), result(15)).state;
    expect(recordDaily(day1, { ...result(14), dateKey: '2026-10-14' }).isPersonalBest).toBe(false);
    expect(recordDaily(day1, { ...result(16), dateKey: '2026-10-14' }).isPersonalBest).toBe(true);
  });
});

describe('recordRun', () => {
  it('refuses a running run', () => {
    expect(() => recordRun(emptyState(), startRun(), now)).toThrow();
  });

  it('credits bonus XP and stores the best run', () => {
    const ft = finish(Array.from({ length: 40 }, () => 'correct' as const));
    const out = recordRun(emptyState(), ft, now);
    expect(out.summary).toMatchObject({ placement: 1, finalTable: true, levelsCompleted: 8, bonusXp: 180, dateKey: '2026-10-13' });
    expect(out.state.profile.xp).toBe(180);
    expect(out.state.bestRun).toEqual(out.summary);
    expect(out.isPersonalBest).toBe(true);

    const bust = recordRun(out.state, finish(['wrong', 'wrong', 'wrong']), now);
    expect(bust.isPersonalBest).toBe(false);
    expect(bust.state.bestRun).toEqual(out.summary);
    expect(bust.state.runs).toHaveLength(2);
  });
});

describe('setSound', () => {
  it('toggles the sound preference', () => {
    expect(setSound(emptyState(), false).profile.soundOn).toBe(false);
  });
});

describe('input sanitising', () => {
  it('stores a valid response time for NaN, negative and infinite input and stays saveable', async () => {
    for (const responseMs of [Number.NaN, -500, Number.POSITIVE_INFINITY]) {
      const out = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs, mode: 'training', now });
      expect(Number.isFinite(out.record.responseMs) && out.record.responseMs >= 0).toBe(true);
      const backend = memoryBackend();
      await saveState(backend, out.state);
      expect((await loadState(backend, now)).state.profile.xp).toBe(out.state.profile.xp);
    }
  });

  it('rounds the response time and treats a non-finite time as slow', () => {
    const rounded = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: 1200.6, mode: 'training', now });
    expect(rounded.record.responseMs).toBe(1201);
    const nan = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: Number.NaN, mode: 'training', now });
    expect(nan.xp.xp).toBe(10);
    const negative = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: -500, mode: 'training', now });
    expect(negative.record.responseMs).toBe(0);
  });

  it('rejects an invalid date', () => {
    const invalid = new Date(Number.NaN);
    expect(() =>
      recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now: invalid }),
    ).toThrow(/Ungültiges Datum/);
    expect(() => recordRun(emptyState(), finish(['wrong', 'wrong', 'wrong']), invalid)).toThrow(/Ungültiges Datum/);
  });

  it('rejects invalid daily results', () => {
    const base = { dateKey: '2026-10-13', correct: 15, total: 20, durationMs: 70_000 };
    const bad = [
      { ...base, correct: 21 }, { ...base, correct: -1 }, { ...base, correct: 1.5 }, { ...base, total: Number.NaN },
      { ...base, durationMs: -1 }, { ...base, durationMs: Number.POSITIVE_INFINITY }, { ...base, durationMs: 0.5 },
    ];
    for (const result of bad) expect(() => recordDaily(emptyState(), result)).toThrow(/Ungültiges Daily-Ergebnis/);
  });
});

describe('recordRun trimming', () => {
  it('keeps only the newest MAX_RUNS runs', () => {
    const old: RunSummary[] = Array.from({ length: MAX_RUNS }, (_, i) => ({
      ts: i, dateKey: '2026-10-01', placement: 2000, finalTable: false, levelsCompleted: 0, bonusXp: 0,
    }));
    const out = recordRun({ ...emptyState(), runs: old }, finish(['wrong', 'wrong', 'wrong']), now);
    expect(out.state.runs).toHaveLength(MAX_RUNS);
    expect(out.state.runs[0].ts).toBe(1);
    expect(out.state.runs[MAX_RUNS - 1]).toEqual(out.summary);
  });
});

describe('active run', () => {
  it('starts, answers and clears the active run when recorded', () => {
    const before = emptyState();
    let state = startActiveRun(before);
    expect(before.activeRun).toBeNull();
    expect(state.activeRun).toEqual(startRun());
    state = answerActiveRun(state, 'correct');
    expect(state.activeRun).toMatchObject({ answered: 1, spotInLevel: 1 });
    state = startActiveRun(state);
    expect(state.activeRun).toEqual(startRun());
    for (let i = 0; i < 3; i++) state = answerActiveRun(state, 'wrong');
    expect(state.activeRun?.status).toBe('busted');
    const out = recordRun(state, state.activeRun as RunState, now);
    expect(out.state.activeRun).toBeNull();
    expect(out.summary.placement).toBe(2000);
  });

  it('refuses to answer without an active run', () => {
    expect(() => answerActiveRun(emptyState(), 'correct')).toThrow(/Kein laufender Run/);
  });

  it('survives a save/load round-trip', async () => {
    const state = answerActiveRun(startActiveRun(emptyState()), 'wrong');
    const backend = memoryBackend();
    await saveState(backend, state);
    expect((await loadState(backend, now)).state.activeRun).toEqual(state.activeRun);
  });
});

describe('statusOf', () => {
  it('reports an empty state', () => {
    expect(statusOf(emptyState(), now)).toEqual({
      rank: { name: 'Fish', minXp: 0, next: { name: 'Donkey', minXp: 500 }, progress: 0 },
      streak: 0,
      dayProgress: { count: 0, target: 20, done: false },
      dailyToday: null,
      bestRun: null,
      activeRun: null,
    });
  });

  it('reports progress, streak and the daily result of today', () => {
    const daily = { dateKey: '2026-10-13', correct: 18, total: 20, durationMs: 60_000 };
    const state: SaveState = {
      ...emptyState(),
      profile: { xp: 600, combo: 0, soundOn: true },
      days: { '2026-10-13': 20, '2026-10-12': 25 },
      daily: { '2026-10-12': { ...daily, dateKey: '2026-10-12' }, '2026-10-13': daily },
    };
    const status = statusOf(state, now);
    expect(status.rank.name).toBe('Donkey');
    expect(status.streak).toBe(2);
    expect(status.dayProgress).toEqual({ count: 20, target: 20, done: true });
    expect(status.dailyToday).toEqual(daily);
  });
});

describe('nextTrainingSpot', () => {
  it('is deterministic for a seed, uses adaptive weights and respects kinds', () => {
    const state = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'fold', responseMs: 1000, mode: 'training', now }).state;
    const a = nextTrainingSpot(data, state, mulberry32(42));
    expect(a).toEqual(nextTrainingSpot(data, state, mulberry32(42)));
    expect(a).toEqual(generateSpot(data, mulberry32(42), { categoryWeights: adaptiveWeights(state.decisions) }));
    const rng = mulberry32(7);
    for (let i = 0; i < 30; i++) expect(nextTrainingSpot(data, state, rng, { kinds: ['call'] }).kind).toBe('call');
  });
});

describe('recordPreflopDecision', () => {
  const aaUtg: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('AA') };
  const fours: PreflopSpot = { ...aaUtg, hand: parseHand('44') };
  const trash: PreflopSpot = { ...aaUtg, hand: parseHand('72o') };

  it('grades the decision and shares XP, combo, day counter and history with push/fold', () => {
    const before: SaveState = { ...emptyState(), profile: { xp: 100, combo: 4, soundOn: true }, days: { '2026-10-13': 3 } };
    const out = recordPreflopDecision(before, { spot: aaUtg, chosen: 'raise', responseMs: 1200, now });
    expect(out.grade).toEqual({ verdict: 'correct', chosen: 'raise', best: 'raise', alternative: null });
    expect(out.xp).toEqual({ xp: 23, combo: 5, multiplier: 1.5 });
    expect(out.state.profile).toEqual({ xp: 123, combo: 5, soundOn: true });
    expect(out.state.days).toEqual({ '2026-10-13': 4 });
    expect(out.record).toEqual({
      ts: now.getTime(), dateKey: '2026-10-13', mode: 'training', game: 'preflop',
      spot: aaUtg, chosen: 'raise', verdict: 'correct', responseMs: 1200,
    });
    expect(out.state.decisions).toEqual([out.record]);
    expect(out.rank).toEqual({ before: 'Fish', after: 'Fish', rankUp: false });
    expect(before.decisions).toEqual([]);
  });

  it('counts a borderline alternative as right and resets the combo on a mistake', () => {
    const close = recordPreflopDecision(emptyState(), { spot: fours, chosen: 'fold', responseMs: 6000, now });
    expect(close.grade.verdict).toBe('close');
    expect(close.xp).toEqual({ xp: 10, combo: 1, multiplier: 1 });
    const wrong = recordPreflopDecision(close.state, { spot: trash, chosen: 'raise', responseMs: 1000, now });
    expect(wrong.grade.verdict).toBe('wrong');
    expect(wrong.state.profile).toMatchObject({ xp: 10, combo: 0 });
    expect(wrong.state.days).toEqual({ '2026-10-13': 2 });
  });

  it('continues the combo of a push/fold decision and reports a rank-up', () => {
    const start: SaveState = { ...emptyState(), profile: { xp: 480, combo: 0, soundOn: true } };
    const pf = recordDecision(data, start, { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    const out = recordPreflopDecision(pf.state, { spot: aaUtg, chosen: 'raise', responseMs: 1000, now });
    expect(out.xp.combo).toBe(2);
    expect(out.rank).toEqual({ before: 'Fish', after: 'Donkey', rankUp: true });
    expect(statusOf(out.state, now).dayProgress.count).toBe(2);
    expect(out.state.decisions.map((d) => d.game ?? 'pushfold')).toEqual(['pushfold', 'preflop']);
  });

  it('stores only the spot fields and survives the save format', () => {
    const out = recordPreflopDecision(emptyState(), { spot: { ...aaUtg, extra: 1 } as PreflopSpot, chosen: 'raise', responseMs: 1000, now });
    expect(out.record.spot).toEqual(aaUtg);
    expect(deserialize(serialize(out.state))).toEqual(out.state);
  });

  it('rejects actions that do not fit and invalid dates', () => {
    expect(() => recordPreflopDecision(emptyState(), { spot: aaUtg, chosen: 'call', responseMs: 1000, now }))
      .toThrow('Aktion call passt nicht zum Spot');
    expect(() => recordPreflopDecision(emptyState(), { spot: aaUtg, chosen: 'raise', responseMs: 1000, now: new Date(Number.NaN) }))
      .toThrow('Ungültiges Datum');
  });
});

describe('nextPreflopTrainingSpot', () => {
  const withFilter = (preflopFilter: PreflopFilter): SaveState => ({ ...emptyState(), profile: { ...emptyState().profile, preflopFilter } });

  it('follows the filter remembered in the profile', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      expect(nextPreflopTrainingSpot(withFilter({ kind: 'vs3bet', stack: 40 }), rng)).toMatchObject({ kind: 'vs3bet', stack: 40 });
    }
  });

  it('mixes all spot types and both stacks without a filter', () => {
    const rng = mulberry32(3);
    const spots = Array.from({ length: 300 }, () => nextPreflopTrainingSpot(emptyState(), rng));
    expect(new Set(spots.map((s) => s.kind))).toEqual(new Set(['rfi', 'vsOpen', 'vs3bet']));
    expect(new Set(spots.map((s) => s.stack))).toEqual(new Set([40, 100]));
  });

  it('weights the categories by starthand mistakes', () => {
    const trash: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('72o') };
    let state = emptyState();
    for (let i = 0; i < 3; i++) state = recordPreflopDecision(state, { spot: trash, chosen: 'raise', responseMs: 1000, now }).state;
    expect(nextPreflopTrainingSpot(state, mulberry32(42)))
      .toEqual(generatePreflopSpot(mulberry32(42), { categoryWeights: preflopAdaptiveWeights(state.decisions) }));
  });
});
