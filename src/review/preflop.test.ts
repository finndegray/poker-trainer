import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { parseHand as parseHandName } from '../engine/cards';
import { gradePreflop } from '../engine/preflop/grading';
import { grade } from '../engine/pushfold';
import { makeFixture } from '../engine/test-fixtures';
import { ANALYSIS_VERSION, type HeroDecision, analyzeHand } from './analysis';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { walkHand } from './hand-model';
import { HERO, parseHand, parseHistory } from './parse';
import { type DecisionRating, UNRATED_TEXT, modelFor, ratePreflopDecision } from './preflop';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';

// Hands with an index below 84 shove/call profitably, the rest fold (same fixture as the UI tests).
const data = makeFixture((h) => (84 - h) / 10);
const AKo = parseHandName('AKo');
const rate = (o: TestHandOptions, d = data): DecisionRating[] =>
  analyzeHand(parseHand(ggHand(o)), d).decisions.map((x) => x.rating);
const first = (o: TestHandOptions) => rate(o)[0];

describe('modelFor', () => {
  it('chooses the model by the rounded effective stack and marks approximations', () => {
    expect(modelFor(0.4)).toEqual({ model: 'pushfold', stack: 1 });
    expect(modelFor(20.4)).toEqual({ model: 'pushfold', stack: 20 });
    expect(modelFor(20.6)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(30)).toEqual({ model: 'chart', depth: 40, approximation: false });
    expect(modelFor(50)).toEqual({ model: 'chart', depth: 40, approximation: false });
    expect(modelFor(51)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(55.4)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(55.6)).toEqual({ model: 'chart', depth: 100, approximation: true });
    expect(modelFor(75)).toEqual({ model: 'chart', depth: 100, approximation: false });
    expect(modelFor(126)).toEqual({ model: 'chart', depth: 100, approximation: true });
  });
});

describe('push/fold spots (up to 20 BB)', () => {
  it('rates an open shove when everybody folded to the hero', () => {
    const r = first({ hero: 'CO', heroCards: 'Ah Kd', stacksBb: { CO: 12 }, lines: [...foldsBetween('UTG', 'CO'), 'Hero: raises 1,100 to 1,200 and is all-in', 'BTN: folds', 'SB: folds', 'BB: folds', 'Uncalled bet (1,100) returned to Hero'] });
    const spot = { kind: 'open', position: 'CO', stack: 12, hand: AKo } as const;
    expect(r).toEqual({ model: 'pushfold', spot, chosen: 'shove', grade: grade(data, spot, 'shove'), effectiveBb: 12 });
  });

  it('uses the biggest stack behind the hero for the effective stack', () => {
    const r = first({ hero: 'CO', stacksBb: { CO: 30, BTN: 8, SB: 14, BB: 5 }, lines: [...foldsBetween('UTG', 'CO'), 'Hero: folds', 'BTN: folds', 'SB: folds'] });
    expect(r).toMatchObject({ model: 'pushfold', spot: { kind: 'open', position: 'CO', stack: 14 }, chosen: 'fold', effectiveBb: 14 });
  });

  it('counts a raise of at least 80 % of the stack as a shove', () => {
    const r = first({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 1,150 to 1,250', 'SB: folds', 'BB: folds', 'Uncalled bet (1,150) returned to Hero'] });
    expect(r).toMatchObject({ model: 'pushfold', chosen: 'shove' });
  });

  it('rates call or fold against a single all-in', () => {
    const lines = ['UTG: raises 900 to 1,000 and is all-in', ...foldsBetween('UTG1', 'BB'), 'Hero: calls 900 and is all-in'];
    const r = first({ hero: 'BB', heroCards: 'Ah Kd', stacksBb: { UTG: 10, BB: 25 }, lines });
    const spot = { kind: 'call', shover: 'UTG', position: 'BB', stack: 10, hand: AKo } as const;
    expect(r).toEqual({ model: 'pushfold', spot, chosen: 'call', grade: grade(data, spot, 'call'), effectiveBb: 10 });
  });

  it('counts a re-shove over an all-in as a call', () => {
    const lines = ['UTG: raises 900 to 1,000 and is all-in', ...foldsBetween('UTG1', 'CO'), 'Hero: raises 1,500 to 2,500 and is all-in', 'BTN: folds', 'SB: folds', 'BB: folds', 'Uncalled bet (1,500) returned to Hero'];
    expect(first({ hero: 'CO', stacksBb: { UTG: 10, CO: 25 }, lines })).toMatchObject({ model: 'pushfold', chosen: 'call' });
  });
});

describe('chart spots (more than 20 BB)', () => {
  it('rates an open-raise with the 100 BB chart', () => {
    const r = first({ hero: 'BTN', heroCards: 'Ah Kd', lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220', 'SB: folds', 'BB: folds', 'Uncalled bet (120) returned to Hero'] });
    const spot = { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: AKo } as const;
    expect(r).toEqual({ model: 'chart', spot, chosen: 'raise', grade: gradePreflop(spot, 'raise'), effectiveBb: 100, approximation: false });
  });

  it('rates a 3-bet against an open-raise with the 40 BB chart, any size', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: raises 3,780 to 4,000 and is all-in', 'SB: folds', 'BB: folds', 'CO: folds', 'Uncalled bet (3,780) returned to Hero'];
    const r = first({ hero: 'BTN', heroCards: '7s 2d', stacksBb: { BTN: 40 }, lines });
    expect(r).toMatchObject({ model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BTN', villain: 'CO' }, chosen: 'threeBet', grade: { verdict: 'wrong', best: 'fold' } });
  });

  it('rates the answer to a 3-bet after the hero opened', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: calls 440'];
    const r = rate({ hero: 'CO', heroCards: 'Ah Kd', lines: [...lines, '*** FLOP *** [2c 7d 9h]', 'Hero: checks', 'BTN: checks'] });
    expect(r[0]).toMatchObject({ model: 'chart', spot: { kind: 'rfi', hero: 'CO' }, chosen: 'raise' });
    expect(r[1]).toMatchObject({ model: 'chart', spot: { kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }, chosen: 'call' });
    expect(r[2]).toEqual({ model: 'unrated', reason: 'postflopPending' });
  });

  it('does not grade a call of a 3-bet shove with the vs3bet chart', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220'];
    const allIn = rate({ hero: 'CO', heroCards: 'Ah Ad', stacksBb: { CO: 30, BTN: 30 }, lines: [...open, 'BTN: raises 2,780 to 3,000 and is all-in', 'SB: folds', 'BB: folds', 'Hero: calls 2,780 and is all-in'] });
    expect(allIn[1]).toEqual({ model: 'unrated', reason: 'deepAllIn' });
    const ninety = rate({ hero: 'CO', heroCards: 'Ah Ad', stacksBb: { CO: 40, BTN: 40 }, lines: [...open, 'BTN: raises 3,380 to 3,600', 'SB: folds', 'BB: folds', 'Hero: calls 3,380'] });
    expect(ninety[1]).toEqual({ model: 'unrated', reason: 'deepAllIn' });
    const foldToShove = rate({ hero: 'CO', stacksBb: { CO: 30, BTN: 30 }, lines: [...open, 'BTN: raises 2,780 to 3,000 and is all-in', 'SB: folds', 'BB: folds', 'Hero: folds'] });
    expect(foldToShove[1]).toEqual({ model: 'unrated', reason: 'deepAllIn' });
  });

  it('treats a 3-bet of 80 % of a stack as all-in, and one just below as a chart spot', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220'];
    const rateAnswer = (to: string, call: string) =>
      rate({ hero: 'CO', heroCards: 'Ah Ad', stacksBb: { CO: 40, BTN: 40 }, lines: [...open, `BTN: raises ${to}`, 'SB: folds', 'BB: folds', `Hero: calls ${call}`] })[1];
    // 3,200 of the 3-bettor's 4,000 chips, no all-in flag.
    expect(rateAnswer('2,980 to 3,200', '2,980')).toEqual({ model: 'unrated', reason: 'deepAllIn' });
    // 3,180 of 4,000 chips is 79.5 % for both stacks.
    expect(rateAnswer('2,960 to 3,180', '2,960')).toMatchObject({ model: 'chart', spot: { kind: 'vs3bet', stack: 40 } });
  });

  it('treats a 3-bet of 80 % of the hero stack as all-in even when the 3-bettor is deep', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220'];
    // 3,200 is 32 % of the 3-bettor's 10,000 chips but 80 % of the hero's 4,000.
    const r = rate({ hero: 'CO', heroCards: 'Ah Ad', stacksBb: { CO: 40, BTN: 100 }, lines: [...open, 'BTN: raises 2,980 to 3,200', 'SB: folds', 'BB: folds', 'Hero: calls 2,980'] });
    expect(r[1]).toEqual({ model: 'unrated', reason: 'deepAllIn' });
  });

  it('marks charts as an approximation when the stack is more than 25 % away', () => {
    const r = first({ hero: 'BTN', stacksBb: { BTN: 28 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: folds', 'SB: folds'] });
    expect(r).toMatchObject({ model: 'chart', spot: { stack: 40 }, effectiveBb: 28, approximation: true });
  });
});

describe('not rated, with a reason', () => {
  const unrated = (o: TestHandOptions) => first(o);
  it('limp and limp pots', () => {
    expect(unrated({ hero: 'CO', lines: ['UTG: calls 100', ...foldsBetween('UTG1', 'CO'), 'Hero: raises 400 to 500'] })).toEqual({ model: 'unrated', reason: 'limp' });
    expect(unrated({ hero: 'CO', lines: [...foldsBetween('UTG', 'CO'), 'Hero: calls 100'] })).toEqual({ model: 'unrated', reason: 'limp' });
  });
  it('callers before the hero and squeezes', () => {
    const base = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'BTN: calls 220'];
    expect(unrated({ hero: 'SB', lines: [...base, 'Hero: calls 170'] })).toEqual({ model: 'unrated', reason: 'multiway' });
    expect(unrated({ hero: 'SB', lines: [...base, 'Hero: raises 900 to 950'] })).toEqual({ model: 'unrated', reason: 'squeeze' });
  });
  it('several raises before the hero and 4-bet pots', () => {
    expect(unrated({ hero: 'BTN', lines: ['UTG: raises 120 to 220', ...foldsBetween('UTG1', 'CO'), 'CO: raises 440 to 660', 'Hero: folds'] })).toEqual({ model: 'unrated', reason: 'multiRaise' });
    const fourBet = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: raises 900 to 1,560', 'BTN: raises 2,000 to 3,560', 'Hero: folds', 'Uncalled bet (2,000) returned to BTN'];
    expect(rate({ hero: 'CO', lines: fourBet })[2]).toEqual({ model: 'unrated', reason: 'deepPot' });
  });
  it('raise or call with at most 20 BB that is no push/fold spot', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220'];
    expect(unrated({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...open, 'Hero: calls 220'] })).toEqual({ model: 'unrated', reason: 'shortNotPushFold' });
    expect(unrated({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220'] })).toEqual({ model: 'unrated', reason: 'shortNotPushFold' });
  });
  it('an all-in with more than 20 BB', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 2,900 to 3,000 and is all-in', 'Hero: folds'];
    expect(unrated({ hero: 'BTN', stacksBb: { CO: 30, BTN: 40 }, lines })).toEqual({ model: 'unrated', reason: 'deepAllIn' });
  });
  it('positions that cannot be derived', () => {
    const hand = parseHand(ggHand({ hero: 'BTN', lines: [...foldsBetween('UTG', 'BTN'), 'Hero: folds', 'SB: folds'] }));
    const index = hand.events.findIndex((e) => e.type === 'action' && e.player === HERO);
    const state = walkHand(hand, null)[index];
    expect(ratePreflopDecision(hand, index, state, null, data)).toEqual({ model: 'unrated', reason: 'positions' });
  });
  it('a spot the model does not cover (first action of the big blind)', () => {
    expect(unrated({ hero: 'BB', lines: ['SB: folds', 'Hero: raises 200 to 300'] })).toEqual({ model: 'unrated', reason: 'otherSpot' });
  });
  it('other table sizes and missing hole cards', () => {
    const lines = [...foldsBetween('UTG', 'BTN'), 'Hero: folds', 'SB: folds'];
    expect(unrated({ hero: 'BTN', tableSize: 9, lines })).toEqual({ model: 'unrated', reason: 'tableSize' });
    expect(unrated({ hero: 'BTN', heroCards: null, lines })).toEqual({ model: 'unrated', reason: 'noHoleCards' });
  });
  it('every reason has a German text', () => {
    expect(UNRATED_TEXT.postflopPending).toBe('Postflop-Bewertung folgt');
    expect(UNRATED_TEXT.shortNotPushFold).toBe('Spot mit höchstens 20 BB (kein Push/Fold-Spot)');
    expect(Object.values(UNRATED_TEXT).every((t) => t.length > 0)).toBe(true);
  });
});

describe('analyzeHand with the real hands', () => {
  const real = getPushFoldData();
  const hands = [...parseHistory(dailyClassic).hands, ...parseHistory(steps).hands, parseHand(bounty)];
  const decisions = (id: string): HeroDecision[] => analyzeHand(hands.find((h) => h.id === id)!, real).decisions;

  it('stores the analysis version', () => {
    expect(analyzeHand(hands[0], real).version).toBe(ANALYSIS_VERSION);
  });

  it('preflop fold: UTG+1 at a 7-handed table with 74 BB uses the 100 BB chart as an approximation', () => {
    const [d] = decisions('TM6532800963');
    expect(d).toMatchObject({ street: 'preflop', action: 'fold', pot: 285, toCall: 120, stack: 8929 });
    expect(d.rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 100, hero: 'UTG1' }, chosen: 'fold', approximation: true, grade: { verdict: 'correct' } });
  });

  it('open-raise: K6o on the button with 92 BB is outside the chart', () => {
    expect(decisions('TM6532186101')[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 100, hero: 'BTN' }, chosen: 'raise', approximation: false, grade: { verdict: 'wrong', best: 'fold' } });
  });

  it('3-bet pot: 73s 3-bet from the BB against the SB with 45 BB effective', () => {
    expect(decisions('TM6533069892')[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB' }, chosen: 'threeBet', approximation: false, grade: { verdict: 'wrong' } });
  });

  it('push/fold: A4o open shove from the HJ with 16 BB', () => {
    const [d] = decisions('TM6532734973');
    const spot = { kind: 'open', position: 'HJ', stack: 16, hand: parseHandName('A4o') } as const;
    expect(d.rating).toEqual({ model: 'pushfold', spot, chosen: 'shove', grade: grade(real, spot, 'shove'), effectiveBb: 16.4 });
  });

  it('all-in preflop with showdown: AQs re-shove over a 10 BB UTG shove counts as a call', () => {
    const [d] = decisions('TM6532448269');
    expect(d.rating).toMatchObject({ model: 'pushfold', spot: { kind: 'call', shover: 'UTG', position: 'CO', stack: 10, hand: parseHandName('AQs') }, chosen: 'call' });
    expect(decisions('TM6532448269')).toHaveLength(1);
  });

  it('limp pot: both decisions are not rated', () => {
    expect(decisions('TM6533069879').map((d) => d.rating)).toEqual([
      { model: 'unrated', reason: 'limp' },
      { model: 'unrated', reason: 'limp' },
    ]);
  });

  it('postflop decisions are listed with "Postflop-Bewertung folgt"', () => {
    const list = decisions('TM6532114653');
    expect(list.map((d) => [d.street, d.action])).toEqual([
      ['preflop', 'raise'], ['flop', 'bet'], ['turn', 'bet'], ['turn', 'call'], ['river', 'check'], ['river', 'fold'],
    ]);
    expect(list.slice(1).every((d) => d.rating.model === 'unrated' && d.rating.reason === 'postflopPending')).toBe(true);
    expect(list[3]).toMatchObject({ pot: 7266, toCall: 2046, stack: 6946 });
  });

  it('satellite hand: 3-bet from the BB answered with a call is rated with the 40 BB chart', () => {
    const list = decisions('TM6532443900');
    expect(list[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 40, hero: 'SB' }, approximation: true });
    expect(list[1].rating).toMatchObject({ model: 'chart', spot: { kind: 'vs3bet', stack: 40, hero: 'SB', villain: 'BB' }, chosen: 'call' });
    expect(list[3]).toMatchObject({ street: 'flop', action: 'raise', allIn: true });
  });

  it('rates the hero, never another player', () => {
    for (const h of hands) {
      for (const d of analyzeHand(h, real).decisions) {
        const e = h.events[d.eventIndex];
        expect(e.type === 'action' && e.player === HERO).toBe(true);
      }
    }
  });
});
