import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HeroDecision, analyzeHand } from './analysis';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';
import type { DecisionRating } from './preflop';
import { retrainingCandidates } from './retraining';

const decision = (eventIndex: number, rating: DecisionRating, street: HeroDecision['street'] = 'preflop'): HeroDecision => ({
  eventIndex, street, action: 'fold', allIn: false, pot: 150, toCall: 0, stack: 2000, amount: 0, to: null, rating,
});
const hand = (id: string, playedAt: string, decisions: HeroDecision[]) => ({ id, playedAt, analysis: { version: 2, decisions } });
const wrongOpen: DecisionRating = {
  model: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 }, chosen: 'shove',
  grade: { verdict: 'wrong', chosen: 'shove', best: 'fold', evAggressive: -0.4, evFold: 0 }, effectiveBb: 16.2,
};
const wrongChart: DecisionRating = {
  model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 }, chosen: 'threeBet',
  grade: { verdict: 'wrong', chosen: 'threeBet', best: 'call', alternative: null }, effectiveBb: 27, approximation: true,
};

describe('retrainingCandidates', () => {
  it('turns the preflop errors of the Daily Classic fixture into spots, oldest hand first', () => {
    const data = getPushFoldData();
    const hands = parseHistory(dailyClassic).hands.map((h) => ({ id: h.id, playedAt: h.playedAt, analysis: analyzeHand(h, data) }));
    expect(retrainingCandidates('normal', hands)).toEqual([
      { key: 'TM6532186101:15', playedAt: '2026-10-13 13:15:28', game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 } },
      { key: 'TM6533069892:17', playedAt: '2026-10-13 13:36:58', game: 'preflop', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 } },
      { key: 'TM6532734973:13', playedAt: '2026-10-13 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 } },
    ]);
    expect(retrainingCandidates('satellit', hands)).toEqual([]);
    expect(retrainingCandidates('bounty', hands)).toEqual([]);
  });

  it('maps push/fold and chart errors, also approximations', () => {
    const list = retrainingCandidates('normal', [hand('TM2', '2026-10-12 21:00:00', [decision(13, wrongOpen), decision(20, wrongChart)])]);
    expect(list).toEqual([
      { key: 'TM2:13', playedAt: '2026-10-12 21:00:00', game: 'pushfold', spot: wrongOpen.spot },
      { key: 'TM2:20', playedAt: '2026-10-12 21:00:00', game: 'preflop', spot: wrongChart.spot },
    ]);
  });

  it('leaves out close and correct decisions, unrated and postflop decisions and the free BB call at 1 BB', () => {
    const close: DecisionRating = { ...wrongOpen, grade: { ...wrongOpen.grade, verdict: 'close' } } as DecisionRating;
    const correct: DecisionRating = { ...wrongChart, grade: { ...wrongChart.grade, verdict: 'correct' } } as DecisionRating;
    const freeCall: DecisionRating = { ...wrongOpen, spot: { kind: 'call', shover: 'SB', position: 'BB', stack: 1, hand: 160 }, chosen: 'fold' } as DecisionRating;
    const unrated: DecisionRating = { model: 'unrated', reason: 'limp' };
    const postflop = {
      model: 'postflop', verdict: 'mistake', reason: 'callTooWeak', equity: 0.04, needed: 0.2, bonus: 0, outs: 0, betShare: null,
      spr: 0.4, villainPosition: 'BB',
    } as unknown as DecisionRating;
    const broken: DecisionRating = { ...wrongOpen, spot: { kind: 'open', position: 'BB', stack: 16, hand: 130 } } as DecisionRating;
    const list = retrainingCandidates('normal', [
      hand('TM3', '2026-10-12 21:00:00', [decision(9, close), decision(10, correct), decision(11, freeCall), decision(12, unrated), decision(30, postflop, 'turn'), decision(14, broken)]),
    ]);
    expect(list).toEqual([]);
  });
});
