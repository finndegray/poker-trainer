import { describe, expect, it } from 'vitest';
import type { PreflopSpot } from '../engine/preflop/spots';
import {
  actionLabel,
  aggressiveWord,
  evLine,
  formatBb,
  formatChipsBb,
  formatCount,
  formatDateKey,
  formatEv,
  formatPer100,
  formatPercent,
  formatPlayedAt,
  formatRetrainingCount,
  preflopChoiceLabel,
  preflopSituationText,
  preflopSpotTitle,
  retrainingHint,
  reviewActionLabel,
  streetLabel,
  verdictLabel,
  xpSummary,
} from './format';

describe('format', () => {
  it('formats EVs the German way with a sign', () => {
    expect(formatEv(0.42)).toBe('+0,42 BB');
    expect(formatEv(-1.3)).toBe('−1,30 BB');
    expect(formatEv(12.345)).toBe('+12,35 BB');
    expect(formatEv(0)).toBe('0 BB');
    expect(formatEv(0.004)).toBe('0 BB');
    expect(formatEv(-0.004)).toBe('0 BB');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.625)).toBe('63 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(null)).toBe('–');
  });

  it('formats counts with the German thousands separator', () => {
    expect(formatCount(1240)).toBe('1.240');
    expect(formatCount(312)).toBe('312');
  });

  it('labels actions, verdicts and EV lines', () => {
    expect(actionLabel('shove')).toBe('All-in');
    expect(actionLabel('call')).toBe('Call');
    expect(actionLabel('fold')).toBe('Fold');
    expect(aggressiveWord('open')).toBe('Push');
    expect(aggressiveWord('call')).toBe('Call');
    expect(evLine('open', 0.42)).toBe('All-in +0,42 BB · Fold 0 BB');
    expect(evLine('call', -0.8)).toBe('Call −0,80 BB · Fold 0 BB');
    expect(verdictLabel('correct')).toBe('Richtig');
    expect(verdictLabel('close')).toBe('Knapp – beides okay');
    expect(verdictLabel('wrong')).toBe('Falsch');
  });
});

describe('starthand formatting', () => {
  const spot = (s: Omit<PreflopSpot, 'hand'>): PreflopSpot => ({ ...s, hand: 0 });

  it('formats BB amounts with the German decimal comma', () => {
    expect(formatBb(6.6)).toBe('6,6');
    expect(formatBb(3)).toBe('3');
    expect(formatBb(14.52)).toBe('14,5');
    expect(formatBb(0.5)).toBe('0,5');
  });

  it('labels the buttons with their sizes', () => {
    const vsOpen = spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' });
    expect(preflopChoiceLabel('threeBet', vsOpen)).toBe('3-Bet auf 6,6 BB');
    expect(preflopChoiceLabel('call', vsOpen)).toBe('Call');
    expect(preflopChoiceLabel('fold', vsOpen)).toBe('Fold');
    expect(preflopChoiceLabel('threeBet', spot({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'UTG' }))).toBe('3-Bet auf 8,8 BB');
    expect(preflopChoiceLabel('raise', spot({ kind: 'rfi', stack: 40, hero: 'UTG', villain: null }))).toBe('Raise auf 2,2 BB');
    expect(preflopChoiceLabel('raise', spot({ kind: 'rfi', stack: 100, hero: 'SB', villain: null }))).toBe('Raise auf 3 BB');
    expect(preflopChoiceLabel('fourBet', spot({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }))).toBe('4-Bet auf 14,5 BB');
    expect(preflopChoiceLabel('fourBet', spot({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB' }))).toBe('All-in 40 BB');
  });

  it('describes the action before the hero', () => {
    expect(preflopSituationText(spot({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }))).toBe('Alle folden zu dir');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' }))).toBe('CO erhöht auf 2,2 BB');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB' }))).toBe('SB erhöht auf 3 BB');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 40, hero: 'LJ', villain: 'UTG1' }))).toBe('UTG+1 erhöht auf 2,2 BB');
    expect(preflopSituationText(spot({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }))).toBe('BTN 3-bettet auf 6,6 BB');
    expect(preflopSituationText(spot({ kind: 'vs3bet', stack: 100, hero: 'UTG', villain: 'BB' }))).toBe('BB 3-bettet auf 8,8 BB');
  });

  it('names the spot for the feedback heading', () => {
    expect(preflopSpotTitle(spot({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }))).toBe('Open-Raise aus CO');
    expect(preflopSpotTitle(spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG1' }))).toBe('BTN gegen Open-Raise aus UTG+1');
    expect(preflopSpotTitle(spot({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB' }))).toBe('CO gegen 3-Bet aus BB');
  });

  it('sums up the XP of a decision', () => {
    expect(xpSummary({ xp: 23, combo: 5, multiplier: 1.5 })).toBe('+23 XP · Combo ×1,5 · 5 in Folge');
    expect(xpSummary({ xp: 15, combo: 1, multiplier: 1 })).toBe('+15 XP');
    expect(xpSummary({ xp: 0, combo: 0, multiplier: 1 })).toBe('0 XP');
  });
  it('formats the hand review numbers and dates', () => {
    expect(formatPer100(null)).toBe('–');
    expect(formatPer100(3.25)).toBe('3,3');
    expect(formatPer100(50)).toBe('50');
    expect(formatChipsBb(1650, 300)).toBe('5,5');
    expect(formatChipsBb(19680, 1200)).toBe('16,4');
    expect(formatDateKey('2026-10-13')).toBe('13.10.2026');
    expect(formatPlayedAt('2026-10-13 15:46:28')).toBe('13.10.2026 15:46');
    expect(streetLabel('turn')).toBe('Turn');
  });

  it('formats the retraining hint and the queue size', () => {
    expect(retrainingHint('2026-10-12 15:46:28')).toBe('Aus deinem Turnier vom 12.10.');
    expect(retrainingHint('2026-01-05 09:00:00')).toBe('Aus deinem Turnier vom 05.01.');
    expect(retrainingHint('2026-10-14 18:05:09', 'TM6532734973:13')).toBe('Aus deinem Turnier vom 14.10.');
    expect(retrainingHint('2026-10-14 18:05:09', 'SIT1760457909000:10')).toBe('Aus deiner Situation vom 14.10.');
    expect(formatRetrainingCount(1)).toBe('1 Spot aus deinen Turnieren wartet im Training.');
    expect(formatRetrainingCount(200)).toBe('200 Spots aus deinen Turnieren warten im Training.');
  });

  it('labels hand-history actions in BB', () => {
    expect(reviewActionLabel({ action: 'fold', amount: 0, to: null, allIn: false }, 100)).toBe('Fold');
    expect(reviewActionLabel({ action: 'check', amount: 0, to: null, allIn: false }, 100)).toBe('Check');
    expect(reviewActionLabel({ action: 'call', amount: 150, to: null, allIn: false }, 100)).toBe('Call 1,5 BB');
    expect(reviewActionLabel({ action: 'bet', amount: 300, to: null, allIn: true }, 100)).toBe('Bet 3 BB · All-in');
    expect(reviewActionLabel({ action: 'raise', amount: 500, to: 600, allIn: false }, 100)).toBe('Raise auf 6 BB');
  });
});
