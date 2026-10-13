import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import { rangeFromClasses, rangeWeight, removeCards } from '../engine/postflop/combos';
import { chartFor } from '../engine/preflop/charts';
import { positionsOf, walkHand } from './hand-model';
import { parseHand } from './parse';
import { type PostflopRating, ratePostflop } from './postflop';
import { KEEP_AFTER_ALL_IN, KEEP_AFTER_BET } from './postflop-rules';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';

// CO opens, the hero calls on the button, the blinds fold: pot 670 chips (BB 100, ante 10) on the flop.
const PRE = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds'];
const FLOP = '*** FLOP *** [Ks 7d 2c]';
const TURN = '*** TURN *** [Ks 7d 2c] [Qh]';
const RIVER = '*** RIVER *** [Ks 7d 2c Qh] [3d]';

const ratings = (o: Partial<TestHandOptions> & { lines: string[] }) => {
  const hand = parseHand(ggHand({ hero: 'BTN', ...o }));
  return [...ratePostflop(hand, walkHand(hand), positionsOf(hand)).values()];
};
const postflop = (r: unknown) => r as PostflopRating;

describe('ratePostflop', () => {
  it('narrows the opener range after his bet and computes pot odds, SPR and equity', () => {
    const [call] = ratings({ heroCards: 'Ah Kd', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300'] });
    const start = rangeFromClasses(chartFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }).aggressive);
    const live = rangeWeight(removeCards(start, ['Ah', 'Kd', 'Ks', '7d', '2c'].map(parseCard)));
    expect(call).toMatchObject({ model: 'postflop', verdict: 'ok', reason: 'callOk', villainPosition: 'CO', villainRole: 'opener', depth: 100 });
    expect(postflop(call).combos).toBeCloseTo(live * KEEP_AFTER_BET, 6);
    expect(postflop(call).needed).toBeCloseTo(300 / 1270, 9);
    expect(postflop(call).spr).toBeCloseTo(9480 / 970, 9);
    expect(postflop(call).equity).toBeGreaterThan(0.6);
  });

  it('call without equity on the river: wahrscheinlich Fehler', () => {
    const lines = [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300', TURN, 'CO: bets 800', 'Hero: calls 800', RIVER, 'CO: bets 2,000', 'Hero: calls 2,000'];
    const list = ratings({ heroCards: '6s 5s', lines });
    expect(list.at(-1)).toMatchObject({ model: 'postflop', verdict: 'mistake', reason: 'callTooWeak' });
  });

  it('fold of a set against a bet: wahrscheinlich Fehler', () => {
    const [fold] = ratings({ heroCards: 'Kh Kc', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: folds'] });
    expect(fold).toMatchObject({ model: 'postflop', verdict: 'mistake', reason: 'foldTooStrong' });
  });

  it('river check behind with a set: fraglich ("Value verschenkt?"), the checks before are fine', () => {
    const lines = [...PRE, FLOP, 'CO: checks', 'Hero: checks', TURN, 'CO: checks', 'Hero: checks', RIVER, 'CO: checks', 'Hero: checks'];
    const list = ratings({ heroCards: 'Kh Kc', lines });
    expect(list.map((r) => postflop(r).reason)).toEqual(['checkOk', 'checkOk', 'checkValue']);
    expect(list[2]).toMatchObject({ verdict: 'questionable' });
  });

  it('tiny bet and raise without equity: fraglich', () => {
    expect(ratings({ lines: [...PRE, FLOP, 'CO: checks', 'Hero: bets 50'] })[0]).toMatchObject({ verdict: 'questionable', reason: 'betSize' });
    expect(postflop(ratings({ lines: [...PRE, FLOP, 'CO: checks', 'Hero: bets 50'] })[0]).betShare).toBeCloseTo(50 / 670, 9);
    const raise = ratings({ heroCards: '4h 3h', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: raises 600 to 900'] })[0];
    expect(raise).toMatchObject({ verdict: 'questionable', reason: 'raiseWeak' });
    expect(postflop(raise).betShare).toBeCloseTo(600 / 1270, 9);
  });

  it('gives the implied-odds bonus to a flop call with a flush draw', () => {
    const [call] = ratings({ heroCards: 'Ad 5d', lines: [...PRE, '*** FLOP *** [Kd 7d 2c]', 'CO: bets 300', 'Hero: calls 300'] });
    expect(call).toMatchObject({ model: 'postflop', bonus: 5, outs: 9 });
  });

  it('does not rate multiway pots or short stacks, and says why', () => {
    const multi = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: calls 120', FLOP, 'BB: checks', 'CO: bets 300', 'Hero: calls 300'];
    expect(ratings({ lines: multi })).toEqual([{ model: 'unrated', reason: 'multiwayPostflop' }]);
    expect(ratings({ stacksBb: { BTN: 15 }, lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300'] })).toEqual([{ model: 'unrated', reason: 'shortRange' }]);
  });

  it('is deterministic: the same hand gives the same equities (fixed seed per decision)', () => {
    const o = { heroCards: 'Qh Jh', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300', TURN, 'CO: checks', 'Hero: bets 600'] };
    expect(ratings(o)).toEqual(ratings(o));
  });
  describe('villain bet larger than the hero stack', () => {
    // Hero has 30 BB (2,780 chips left after the call), CO shoves 9,780 into 670: only 2,780 of it can be matched.
    const SHOVE = [...PRE, FLOP, 'CO: bets 9,780 and is all-in'];
    const spot = (heroCards: string, action: string) => ratings({ heroCards, stacksBb: { BTN: 30 }, lines: [...SHOVE, action] });

    it('needed equity uses the pot without the uncalled part (fold is not a mistake)', () => {
      const [fold] = spot('Qh Jh', 'Hero: folds');
      expect(postflop(fold).needed).toBeCloseTo(2780 / (3450 + 2780), 9);
      expect(fold).toMatchObject({ model: 'postflop', verdict: 'ok' });
    });

    it('a call shows the same corrected needed equity', () => {
      const [call] = spot('Qh Jh', 'Hero: calls 2,780');
      expect(postflop(call).needed).toBeCloseTo(2780 / (3450 + 2780), 9);
    });

    it('a normal bet keeps its numbers (no uncalled part)', () => {
      const [call] = ratings({ heroCards: 'Ah Kd', lines: [...PRE, FLOP, 'CO: bets 1,000', 'Hero: calls 1,000'] });
      expect(postflop(call).needed).toBeCloseTo(1000 / 2670, 9);
    });
  });

  it('keeps the range weights from street to street and applies KEEP_AFTER_ALL_IN to a villain shove', () => {
    const base = [...PRE, FLOP, 'CO: checks', 'Hero: checks', TURN];
    const [, afterBet] = ratings({ heroCards: 'Ah Kd', lines: [...base, 'CO: bets 300', 'Hero: calls 300'] }).map((r) => postflop(r).combos);
    const [, afterShove] = ratings({ heroCards: 'Ah Kd', stacksBb: { BTN: 30 }, lines: [...base, 'CO: bets 9,780 and is all-in', 'Hero: calls 2,780'] }).map((r) => postflop(r).combos);
    expect(afterBet).toBeDefined();
    expect(afterShove).toBeDefined();
    expect(afterShove / afterBet).toBeCloseTo(KEEP_AFTER_ALL_IN / KEEP_AFTER_BET, 6);
  });
});
