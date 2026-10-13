import { cardName } from '../engine/cards';
import { type ComboRange, keepShare, rangeFromClasses, rangeWeight, removeCards } from '../engine/postflop/combos';
import { equityVsRange } from '../engine/postflop/range-equity';
import { comboStrengths, drawOuts } from '../engine/postflop/strength';
import type { StackDepth } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import { mulberry32, seedFromString } from '../engine/rng';
import { type TableState, maxStreetBet } from './hand-model';
import { type ActionEvent, type BoardStreet, HERO, type ParsedHand } from './parse';
import {
  FLOP_SAMPLES,
  KEEP_AFTER_ALL_IN,
  KEEP_AFTER_BET,
  KEEP_AFTER_CALL,
  KEEP_AFTER_CHECK,
  KEEP_AFTER_RAISE,
  POT_PER_OUT,
  type PostflopReason,
  type PostflopSituation,
  type PostflopVerdict,
  judgePostflop,
} from './postflop-rules';
import type { UnratedRating } from './preflop';
import { type RangeProblem, type VillainRole, villainStart } from './villain-range';

export type PostflopRating = {
  model: 'postflop';
  verdict: PostflopVerdict;
  reason: PostflopReason;
  /** Hero equity against the narrowed villain range, 0–1. */
  equity: number;
  /** Equity the pot odds ask for, 0–1 (0 without a bet to call). */
  needed: number;
  /** Implied-odds points added to the equity of a call (0 or 5). */
  bonus: number;
  outs: number;
  /** Hero bet or raise as a share of the pot (a raise: the part above the call, against the pot after the call). */
  betShare: number | null;
  /** Effective stack behind (smaller of hero and villain) divided by the pot. */
  spr: number;
  villainPosition: Position;
  villainRole: VillainRole;
  depth: StackDepth;
  approximation: boolean;
  /** Weight of the narrowed villain range in combos. */
  combos: number;
};

/**
 * Pot odds from the pot before the action and the part of the villain's bet the hero can match.
 * `excess` (the part he cannot match) goes back to the villain, so it is not in the pot the hero can win.
 */
export function potOdds(statePot: number, toCall: number, excess: number) {
  const pot = statePot - excess;
  return { pot, needed: toCall > 0 ? toCall / (pot + toCall) : 0 };
}

/** The part of the bet in front of the hero that exceeds his stack. */
export const unmatchedBet = (state: TableState): number => {
  const hero = state.players.find((p) => p.isHero)!;
  return Math.max(0, maxStreetBet(state) - hero.streetBet - hero.stack);
};

/** Spec 7: equity, pot odds, bet size and SPR from the table right before the hero acted. */
export function postflopNumbers(event: ActionEvent, state: TableState, villain: string) {
  const hero = state.players.find((p) => p.isHero)!;
  const other = state.players.find((p) => p.name === villain)!;
  const toCall = Math.min(hero.stack, maxStreetBet(state) - hero.streetBet);
  const { pot, needed } = potOdds(state.pot, toCall, unmatchedBet(state));
  const betShare =
    event.action === 'bet' ? event.amount / pot : event.action === 'raise' ? (event.amount - toCall) / (pot + toCall) : null;
  return { toCall, needed, betShare, spr: Math.min(hero.stack, other.stack) / pot };
}

const KEEP: Record<'bet' | 'raise' | 'allIn' | 'call' | 'check', { share: number; from: 'strong' | 'weak' }> = {
  bet: { share: KEEP_AFTER_BET, from: 'strong' },
  raise: { share: KEEP_AFTER_RAISE, from: 'strong' },
  allIn: { share: KEEP_AFTER_ALL_IN, from: 'strong' },
  call: { share: KEEP_AFTER_CALL, from: 'strong' },
  check: { share: KEEP_AFTER_CHECK, from: 'weak' },
};

const unrated = (reason: UnratedRating['reason']): UnratedRating => ({ model: 'unrated', reason });

/**
 * Rates every postflop decision of the hero (event index → rating). `states[i]` is the table before event i.
 * Unrated decisions keep their numbers in the decision itself (pot, to call, stack, amount).
 */
export function ratePostflop(
  hand: ParsedHand,
  states: readonly TableState[],
  positions: ReadonlyMap<string, Position> | null,
): Map<number, PostflopRating | UnratedRating> {
  const out = new Map<number, PostflopRating | UnratedRating>();
  const heroEvents = hand.events.flatMap((e, i) => (e.type === 'action' && e.player === HERO && e.street !== 'preflop' ? [i] : []));
  if (heroEvents.length === 0) return out;
  const fail = (reason: UnratedRating['reason'] | RangeProblem) => {
    for (const i of heroEvents) out.set(i, unrated(reason));
    return out;
  };
  if (hand.tableSize !== 8) return fail('tableSize');
  if (!positions || !positions.has(HERO)) return fail('positions');
  if (!hand.heroCards) return fail('noHoleCards');
  const start = villainStart(hand, positions);
  if (typeof start === 'string') return fail(start);

  const heroCards = hand.heroCards;
  let range: ComboRange = removeCards(rangeFromClasses(start.flags), heroCards);
  const strengthCache = new Map<string, Float64Array>();
  const strengths = (board: readonly number[], street: BoardStreet) => {
    const key = board.map(cardName).join('');
    let s = strengthCache.get(key);
    if (!s) strengthCache.set(key, (s = comboStrengths(board, POT_PER_OUT[street])));
    return s;
  };
  let villainActedThisStreet = false;

  hand.events.forEach((event, i) => {
    if (event.type === 'board') {
      range = removeCards(range, event.cards);
      villainActedThisStreet = false;
      return;
    }
    if (event.type !== 'action' || event.street === 'preflop') return;
    const state = states[i];
    const street = event.street;
    if (event.player === start.villain) {
      if (event.action === 'fold') return;
      const allIn = event.allIn || states[i + 1].players.find((p) => p.name === start.villain)!.stack === 0;
      const kind = (event.action === 'bet' || event.action === 'raise') && allIn ? 'allIn' : event.action;
      const keep = KEEP[kind];
      range = keepShare(range, strengths(state.board, street), keep.share, keep.from);
      villainActedThisStreet = true;
      return;
    }
    if (event.player !== HERO) return;
    const equity = equityVsRange(heroCards, state.board, range, mulberry32(seedFromString(`${hand.id}:${i}`)), FLOP_SAMPLES);
    if (equity === null) {
      out.set(i, unrated('unknownRange'));
      return;
    }
    const numbers = postflopNumbers(event, state, start.villain);
    const after = states[i + 1].players;
    const heroAllIn = event.allIn || after.find((p) => p.isHero)!.stack === 0;
    const chipsBehind = !heroAllIn && after.find((p) => p.name === start.villain)!.stack > 0;
    const action: PostflopSituation['action'] =
      (event.action === 'bet' || event.action === 'raise') && heroAllIn ? 'allIn' : event.action;
    const outs = drawOuts(heroCards, state.board).outs;
    const judgement = judgePostflop({
      street,
      action,
      equity: equity * 100,
      needed: numbers.needed * 100,
      betShare: event.action === 'bet' ? numbers.betShare : null,
      outs,
      chipsBehind,
      heroActsLast: street === 'river' && villainActedThisStreet,
    });
    out.set(i, {
      model: 'postflop',
      verdict: judgement.verdict,
      reason: judgement.reason,
      equity,
      needed: numbers.needed,
      bonus: judgement.bonus,
      outs,
      betShare: numbers.betShare,
      spr: numbers.spr,
      villainPosition: start.position,
      villainRole: start.role,
      depth: start.depth,
      approximation: start.approximation,
      combos: rangeWeight(range),
    });
  });
  return out;
}
