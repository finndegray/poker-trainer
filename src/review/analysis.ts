import type { PushFoldData } from '../engine/pushfold-data';
import { maxStreetBet, positionsOf, walkHand } from './hand-model';
import { HERO, type ActionType, type ParsedHand, type Street } from './parse';
import { type DecisionRating, ratePreflopDecision } from './preflop';

/** Bump when the rating logic changes: archived hands with another version are rated again when opened. */
export const ANALYSIS_VERSION = 1;

export type HeroDecision = {
  /** Index into `ParsedHand.events`. */
  eventIndex: number;
  street: Street;
  action: ActionType;
  allIn: boolean;
  /** Chips: pot before the action, still to call, the hero's stack before the action and what he put in. */
  pot: number;
  toCall: number;
  stack: number;
  amount: number;
  /** Street total of a raise, as in the hand history. */
  to: number | null;
  rating: DecisionRating;
};
export type HandAnalysis = { version: number; decisions: HeroDecision[] };

export function analyzeHand(hand: ParsedHand, data: PushFoldData): HandAnalysis {
  const positions = positionsOf(hand);
  const states = walkHand(hand, positions);
  const decisions: HeroDecision[] = [];
  hand.events.forEach((event, index) => {
    if (event.type !== 'action' || event.player !== HERO) return;
    const state = states[index];
    const hero = state.players.find((p) => p.isHero)!;
    const rating: DecisionRating =
      event.street === 'preflop'
        ? ratePreflopDecision(hand, index, state, positions, data)
        : { model: 'unrated', reason: 'postflopPending' };
    decisions.push({
      eventIndex: index,
      street: event.street,
      action: event.action,
      allIn: event.allIn,
      pot: state.pot,
      toCall: Math.min(hero.stack, maxStreetBet(state) - hero.streetBet),
      stack: hero.stack,
      amount: event.amount,
      to: event.to,
      rating,
    });
  });
  return { version: ANALYSIS_VERSION, decisions };
}
