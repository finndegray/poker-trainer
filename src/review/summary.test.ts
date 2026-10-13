import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HandAnalysis, type HeroDecision, analyzeHand } from './analysis';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';
import type { DecisionRating } from './preflop';
import {
  SATELLITE_HINT,
  decisionOutcome,
  errorsPer100,
  handOutcome,
  handSeverity,
  matchesFilter,
  summarize,
  weeklyErrorTrend,
} from './summary';

const decision = (rating: DecisionRating, street: HeroDecision['street'] = 'preflop'): HeroDecision => ({
  eventIndex: 0, street, action: 'fold', allIn: false, pot: 0, toCall: 0, stack: 0, amount: 0, to: null, rating,
});
const chart = (verdict: 'correct' | 'close' | 'wrong'): DecisionRating => ({
  model: 'chart',
  spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 0 },
  chosen: 'fold',
  grade: { verdict, chosen: 'fold', best: 'raise', alternative: null },
  effectiveBb: 100,
  approximation: false,
});
const analysis = (...decisions: HeroDecision[]): HandAnalysis => ({ version: 2, decisions });
const unrated: DecisionRating = { model: 'unrated', reason: 'limp' };
const post = (verdict: 'ok' | 'questionable' | 'mistake'): DecisionRating => ({
  model: 'postflop', verdict, reason: 'callOk', equity: 0.3, needed: 0.25, bonus: 0, outs: 0, betShare: null, spr: 3,
  villainPosition: 'CO', villainRole: 'opener', depth: 100, approximation: false, combos: 120,
});

describe('decisionOutcome', () => {
  it('counts a wrong preflop decision as an error only in normal tournaments', () => {
    expect(decisionOutcome(decision(chart('wrong')), 'normal')).toBe('error');
    expect(decisionOutcome(decision(chart('wrong')), 'satellit')).toBe('hint');
    expect(decisionOutcome(decision(chart('wrong')), 'bounty')).toBe('hint');
    expect(decisionOutcome(decision(chart('close')), 'normal')).toBe('close');
    expect(decisionOutcome(decision(chart('correct')), 'bounty')).toBe('correct');
    expect(decisionOutcome(decision(unrated), 'normal')).toBe('unrated');
    expect(SATELLITE_HINT).toBe('Satellit/Bounty – Standard-Chart nur bedingt gültig');
  });

  it('counts a postflop "wahrscheinlich Fehler" as an error, "fraglich" as questionable', () => {
    expect(decisionOutcome(decision(post('mistake'), 'river'), 'normal')).toBe('error');
    expect(decisionOutcome(decision(post('mistake'), 'river'), 'bounty')).toBe('hint');
    expect(decisionOutcome(decision(post('questionable'), 'flop'), 'normal')).toBe('questionable');
    expect(decisionOutcome(decision(post('questionable'), 'flop'), 'satellit')).toBe('questionable');
    expect(decisionOutcome(decision(post('ok'), 'turn'), 'normal')).toBe('correct');
  });
});

describe('severity and filters', () => {
  it('sorts errors before hints before close calls', () => {
    const error = analysis(decision(chart('correct')), decision(chart('wrong')));
    const close = analysis(decision(chart('close')));
    const none = analysis(decision(unrated));
    expect(handSeverity(error, 'normal')).toBeGreaterThan(handSeverity(error, 'satellit'));
    expect(handSeverity(error, 'satellit')).toBeGreaterThan(handSeverity(close, 'normal'));
    expect(handSeverity(close, 'normal')).toBeGreaterThan(handSeverity(none, 'normal'));
    expect(handSeverity(analysis(), 'normal')).toBe(0);
    expect(handOutcome(error, 'normal')).toBe('error');
    expect(handOutcome(error, 'bounty')).toBe('hint');
    expect(handOutcome(none, 'normal')).toBe('unrated');
    expect(handOutcome(analysis(), 'normal')).toBeNull();
  });

  it('filters "nur Fehler", "auch fraglich" and "alle"', () => {
    const error = analysis(decision(chart('wrong')));
    const close = analysis(decision(chart('close')));
    expect(matchesFilter(error, 'normal', 'errors')).toBe(true);
    expect(matchesFilter(error, 'bounty', 'errors')).toBe(false);
    expect(matchesFilter(error, 'bounty', 'questionable')).toBe(true);
    expect(matchesFilter(close, 'normal', 'questionable')).toBe(false);
    expect(matchesFilter(close, 'normal', 'all')).toBe(true);
    const questionable = analysis(decision(post('questionable'), 'turn'));
    expect(matchesFilter(questionable, 'normal', 'errors')).toBe(false);
    expect(matchesFilter(questionable, 'normal', 'questionable')).toBe(true);
    expect(handSeverity(questionable, 'normal')).toBeGreaterThan(handSeverity(close, 'normal'));
    expect(handSeverity(error, 'bounty')).toBeGreaterThan(handSeverity(questionable, 'normal'));
  });
});

describe('summarize', () => {
  it('counts hands, preflop errors and hints per tournament and per day', () => {
    const entries = [
      { dateKey: '2026-10-12', analysis: analysis(decision(chart('wrong')), decision(post('mistake'), 'flop')) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('correct'))) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('wrong'))) },
    ];
    expect(summarize(entries, 'normal')).toEqual({
      hands: 3,
      preflopErrors: 2,
      postflopErrors: 1,
      hints: 0,
      days: { '2026-10-12': { hands: 1, preflopErrors: 1, postflopErrors: 1 }, '2026-10-13': { hands: 2, preflopErrors: 1, postflopErrors: 0 } },
    });
    expect(summarize(entries, 'satellit')).toMatchObject({ preflopErrors: 0, postflopErrors: 0, hints: 3 });
  });

  it('summarizes the real Daily Classic hands', () => {
    const data = getPushFoldData();
    const entries = parseHistory(dailyClassic).hands.map((h) => ({ dateKey: h.dateKey, analysis: analyzeHand(h, data) }));
    expect(summarize(entries, 'normal')).toMatchObject({ hands: 6, preflopErrors: 3, hints: 0 });
  });
});

describe('errors per 100 hands', () => {
  it('is null without hands', () => {
    expect(errorsPer100(0, 0)).toBeNull();
    expect(errorsPer100(3, 60)).toBe(5);
  });

  it('builds a weekly trend from the day summaries', () => {
    const a = { hands: 40, preflopErrors: 2, postflopErrors: 1, hints: 0, days: { '2026-10-13': { hands: 40, preflopErrors: 1, postflopErrors: 1 } } };
    // b is a Plan 7 summary without postflopErrors per day; a counts postflop errors.
    const b = { hands: 60, preflopErrors: 1, postflopErrors: 0, hints: 0, days: { '2026-10-08': { hands: 10, preflopErrors: 1 }, '2026-10-01': { hands: 50, preflopErrors: 0 } } };
    const trend = weeklyErrorTrend([a, b], '2026-10-13', 3);
    expect(trend).toEqual([
      { weekStart: '2026-09-23', weekEnd: '2026-09-29', hands: 0, errors: 0, per100: null },
      { weekStart: '2026-09-30', weekEnd: '2026-10-06', hands: 50, errors: 0, per100: 0 },
      { weekStart: '2026-10-07', weekEnd: '2026-10-13', hands: 50, errors: 3, per100: 6 },
    ]);
  });
});
