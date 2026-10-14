import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import {
  IllegalStepError,
  type LegalActions,
  type Situation,
  type SituationSetup,
  type SituationState,
  type SituationStep,
  addStep,
  bbToChips,
  isStackBb,
  playSituation,
  undoStep,
  upToLastHeroAction,
} from './model';

const cards = (text: string) => text.split(' ').map(parseCard);
const stacks = (bb: number, over: Partial<Record<Position, number>> = {}) =>
  ({ ...Object.fromEntries(POSITIONS.map((p) => [p, bb])), ...over }) as Record<Position, number>;
const setupOf = (over: Partial<SituationSetup> = {}): SituationSetup => ({
  handId: 'SIT1',
  kind: 'normal',
  hero: 'CO',
  heroCards: [parseCard('Ah'), parseCard('Kd')],
  stacks: stacks(25),
  ...over,
});
const sit = (setup: SituationSetup, ...steps: SituationStep[]): Situation => ({ setup, steps });
const play = (setup: SituationSetup, ...steps: SituationStep[]) => playSituation(sit(setup, ...steps));
const legalOf = (state: SituationState): LegalActions => {
  if (state.phase.type !== 'act') throw new Error(`phase ${state.phase.type}`);
  return state.phase.legal;
};
const FOLD: SituationStep = { type: 'fold' };
const CALL: SituationStep = { type: 'call' };
const CHECK: SituationStep = { type: 'check' };
const raise = (bb: number): SituationStep => ({ type: 'raise', to: bbToChips(bb) });
const bet = (bb: number): SituationStep => ({ type: 'bet', to: bbToChips(bb) });
const board = (text: string): SituationStep => ({ type: 'board', cards: cards(text) });
const folds = (n: number) => Array.from({ length: n }, () => FOLD);

describe('situation model: seats, posts and order', () => {
  it('posts the ante for every seated player and the blinds, then UTG acts first', () => {
    const state = play(setupOf());
    expect(state.events.filter((e) => e.type === 'ante')).toHaveLength(8);
    expect(state.events.slice(-2)).toEqual([
      { type: 'smallBlind', player: 'Spieler7', amount: 400, allIn: false },
      { type: 'bigBlind', player: 'Spieler8', amount: 800, allIn: false },
    ]);
    expect(state.table.pot).toBe(2000);
    expect(legalOf(state)).toEqual({
      position: 'UTG',
      isHero: false,
      fold: true,
      check: false,
      call: { amount: 800, allIn: false },
      bet: null,
      raise: { min: 1600, max: 19900 },
      empty: true,
      suggested: 1760,
    });
  });

  it('lets only the first seats before the hero stay empty, up to the cutoff', () => {
    const empty: SituationStep = { type: 'empty' };
    const state = play(setupOf(), empty, empty);
    expect(state.seated).toEqual(['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(state.table.pot).toBe(600 + 1200);
    expect(legalOf(state)).toMatchObject({ position: 'LJ', empty: true });
    expect(legalOf(play(setupOf(), empty, empty, FOLD))).toMatchObject({ position: 'HJ', empty: false });
    expect(() => addStep(sit(setupOf(), FOLD), empty)).toThrow(IllegalStepError);
    expect(legalOf(play(setupOf({ hero: 'UTG1' }), empty))).toMatchObject({ position: 'UTG1', isHero: true, empty: false });
    const btn = play(setupOf({ hero: 'BTN' }), ...Array.from({ length: 5 }, () => empty));
    expect(btn.seated).toEqual(['BTN', 'SB', 'BB']);
    expect(legalOf(btn)).toMatchObject({ position: 'BTN', empty: false });
  });

  it('closes the preflop round only when every bet is matched and keeps the option of the big blind', () => {
    const open = play(setupOf(), ...folds(4), raise(2.2), FOLD, FOLD);
    expect(legalOf(open)).toMatchObject({ position: 'BB', call: { amount: 960, allIn: false } });
    expect(play(setupOf(), ...folds(4), raise(2.2), FOLD, FOLD, CALL).phase).toEqual({ type: 'board', street: 'flop', count: 3, optional: false });
    const limp = play(setupOf({ hero: 'BB' }), ...folds(6), CALL);
    expect(legalOf(limp)).toMatchObject({ position: 'BB', isHero: true, check: true, fold: false, call: null, raise: { min: 1600, max: 19900 } });
    expect(play(setupOf({ hero: 'BB' }), ...folds(6), CALL, CHECK).phase).toMatchObject({ type: 'board', street: 'flop' });
  });

  it('acts postflop from the small blind on and lets the button act last', () => {
    const flop = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'));
    expect(legalOf(flop)).toMatchObject({ position: 'SB', check: true, bet: { min: 800, max: 19100 }, raise: null, suggested: 1600 });
    const afterChecks = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), CHECK, CHECK);
    expect(legalOf(afterChecks)).toMatchObject({ position: 'BTN', isHero: true });
    expect(play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), CHECK, CHECK, CHECK).phase).toEqual({
      type: 'board',
      street: 'turn',
      count: 1,
      optional: false,
    });
  });

  it('ends the input when the hero folds, without inventing the rest of the hand', () => {
    const state = play(setupOf({ hero: 'UTG' }), FOLD);
    expect(state.phase).toEqual({ type: 'done', reason: 'heroFolded' });
    expect(state.events.at(-1)).toMatchObject({ type: 'action', player: 'Hero', action: 'fold' });
    expect(() => addStep(sit(setupOf({ hero: 'UTG' }), FOLD), FOLD)).toThrow(IllegalStepError);
  });
});

describe('situation model: legal actions and sizes', () => {
  it('never allows a call without a bet, a check against a bet or a raise below the minimum', () => {
    const start = sit(setupOf());
    expect(() => addStep(start, CHECK)).toThrow('Check gegen einen Einsatz ist nicht möglich');
    expect(() => addStep(start, raise(1.9))).toThrow('Einsatz unter dem Minimum');
    expect(() => addStep(start, bet(3))).toThrow('Bet ist hier nicht möglich');
    const flop = sit(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'));
    expect(() => addStep(flop, CALL)).toThrow('Kein Einsatz zum Callen');
    expect(() => addStep(flop, FOLD)).toThrow('Fold ist hier nicht möglich');
  });

  it('asks for the previous bet plus the last raise, at least 1 BB', () => {
    expect(legalOf(play(setupOf(), raise(2.2))).raise).toEqual({ min: 2720, max: 19900 });
    expect(() => addStep(sit(setupOf(), raise(2.2)), raise(3.3))).toThrow('Einsatz unter dem Minimum');
    expect(legalOf(play(setupOf(), raise(2.2), raise(3.4))).raise).toEqual({ min: 3680, max: 19900 });
    const flopBet = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), bet(1.5));
    expect(legalOf(flopBet).raise).toEqual({ min: 2400, max: 19100 });
  });

  it('turns a size above the stack into the all-in and gives the unmatched part back', () => {
    const state = play(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 }, ...folds(7));
    expect(state.events.find((e) => e.type === 'action' && e.action === 'raise')).toEqual({
      type: 'action',
      street: 'preflop',
      player: 'Spieler1',
      action: 'raise',
      amount: 19900,
      to: 19900,
      allIn: true,
    });
    expect(state.events.slice(-2)).toEqual([
      { type: 'uncalled', player: 'Spieler1', amount: 19100 },
      { type: 'collect', player: 'Spieler1', amount: 2800 },
    ]);
    expect(state.phase).toEqual({ type: 'done', reason: 'folded' });
  });

  it('lets an all-in below a full raise reopen nothing for a player who already acted', () => {
    const short = setupOf({ stacks: stacks(25, { BTN: 3 }) });
    const state = play(short, ...folds(4), raise(2), { type: 'raise', to: 999_999 }, FOLD, FOLD);
    expect(state.table.players.find((p) => p.position === 'BTN')).toMatchObject({ streetBet: 2300, allIn: true });
    expect(legalOf(state)).toMatchObject({ position: 'CO', isHero: true, call: { amount: 700, allIn: false }, raise: null });
  });

  it('posts a short blind all-in', () => {
    const state = play(setupOf({ stacks: stacks(25, { BB: 1 }) }));
    expect(state.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: 'Spieler8', amount: 700, allIn: true });
    expect(legalOf(state).call).toEqual({ amount: 700, allIn: false });
  });

  it('suggests the usual sizes', () => {
    const suggested = (...steps: SituationStep[]) => legalOf(play(setupOf({ hero: 'BB' }), ...steps)).suggested;
    expect(suggested()).toBe(1760);
    expect(suggested(CALL)).toBe(bbToChips(3.2));
    expect(suggested(...folds(6))).toBe(bbToChips(3));
    expect(suggested(raise(2.2))).toBe(bbToChips(6.6));
    expect(suggested(raise(2.2), ...folds(6))).toBe(bbToChips(8.8));
    expect(suggested(raise(2.2), raise(6.6))).toBe(bbToChips(14.5));
    // Same stack as the all-in: only a call is left.
    expect(suggested({ type: 'raise', to: 999_999 })).toBeNull();
    expect(legalOf(play(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 })).call).toEqual({ amount: 19900, allIn: true });
  });

  it('accepts stacks of 1 to 200 BB in steps of 0.1', () => {
    expect([1, 25.5, 200].every(isStackBb)).toBe(true);
    expect([0.9, 200.1, 25.55, Number.NaN].some(isStackBb)).toBe(false);
    expect(() => play(setupOf({ stacks: stacks(25, { SB: 0.5 }) }))).toThrow('Stack SB ungültig');
  });
});

describe('situation model: board, all-in, end and undo', () => {
  const shove = sit(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 }, ...folds(6), CALL);

  it('makes the rest of the board optional when everybody is all-in', () => {
    const state = playSituation(shove);
    expect(state.phase).toEqual({ type: 'board', street: 'flop', count: 3, optional: true });
    expect(playSituation(addStep(shove, { type: 'end' })).phase).toEqual({ type: 'done', reason: 'showdown' });
    const runout = [board('2c 7d 9h'), board('Js'), board('3s')].reduce(addStep, shove);
    expect(playSituation(runout).phase).toEqual({ type: 'done', reason: 'showdown' });
    expect(playSituation(runout).table.board).toEqual(cards('2c 7d 9h Js 3s'));
    expect(() => addStep(sit(setupOf()), { type: 'end' })).toThrow('Die Hand ist noch nicht vorbei');
  });

  it('takes only unused board cards, as many as the street needs', () => {
    expect(() => addStep(shove, board('Ah 7d 9h'))).toThrow('Board-Karten ungültig');
    expect(() => addStep(shove, board('2c 7d'))).toThrow('Board-Karten ungültig');
    expect(() => addStep(shove, board('2c 2c 9h'))).toThrow('Board-Karten ungültig');
    expect(playSituation(addStep(shove, board('2c 7d 9h'))).usedCards).toEqual(cards('Ah Kd 2c 7d 9h'));
  });

  it('takes the cards of the opponents at the showdown, once each', () => {
    const ended = addStep(shove, { type: 'end' });
    expect(playSituation(ended).showable).toEqual(['UTG']);
    const shown = addStep(ended, { type: 'show', position: 'UTG', cards: [parseCard('Qs'), parseCard('Qh')] });
    expect(playSituation(shown).showable).toEqual([]);
    expect(playSituation(shown).events.at(-1)).toEqual({ type: 'show', player: 'Spieler1', cards: cards('Qs Qh') });
    expect(() => addStep(shown, { type: 'show', position: 'UTG', cards: [parseCard('2s'), parseCard('2h')] })).toThrow(IllegalStepError);
    expect(() => addStep(ended, { type: 'show', position: 'UTG', cards: [parseCard('Ah'), parseCard('2h')] })).toThrow('Karten ungültig');
    expect(() => addStep(shove, { type: 'show', position: 'UTG', cards: [parseCard('Qs'), parseCard('Qh')] })).toThrow(IllegalStepError);
  });

  it('takes back the last step and cuts the hand after the last hero action', () => {
    const steps: SituationStep[] = [...folds(4), raise(2.2), FOLD, FOLD, CALL];
    const full = sit(setupOf(), ...steps);
    expect(undoStep(full).steps).toEqual(steps.slice(0, -1));
    expect(upToLastHeroAction(full)!.steps).toEqual(steps.slice(0, 5));
    expect(upToLastHeroAction(sit(setupOf(), ...folds(4)))).toBeNull();
  });
});
