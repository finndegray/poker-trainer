import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import type { Spot } from '../engine/pushfold';
import { makeFixture } from '../engine/test-fixtures';
import { MAX_DECISIONS, emptyState, type SaveState } from '../storage/schema';
import { applyRunAnswer, startRun, type RunState } from './endphase-run';
import { recordDaily, recordDecision, recordRun, setSound } from './session';

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
