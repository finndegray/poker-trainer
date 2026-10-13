import { handClassOf } from '../engine/cards';
import { type PreflopGrade, gradePreflop } from '../engine/preflop/grading';
import { type PreflopAction, type PreflopKind, type PreflopSpot, type StackDepth, chartKeyFor } from '../engine/preflop/spots';
import { type Action, type Grade, type Spot, grade } from '../engine/pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from '../engine/pushfold-data';
import { type Position, seatOf } from '../engine/positions';
import { type TableState, playableChips } from './hand-model';
import { type ActionEvent, HERO, type ParsedHand } from './parse';

/** A raise to at least this share of the stack counts as all-in (spec 6). */
export const SHOVE_SHARE = 0.8;
/** Further than this from 40 or 100 BB, the chart is marked as an approximation. */
export const APPROXIMATION_SHARE = 0.25;
export const PUSHFOLD_MAX_BB = MAX_STACK;
export const CHART_40_MAX_BB = 55;

export type UnratedReason =
  | 'tableSize'
  | 'positions'
  | 'noHoleCards'
  | 'limp'
  | 'multiway'
  | 'squeeze'
  | 'multiRaise'
  | 'deepPot'
  | 'shortNotPushFold'
  | 'deepAllIn'
  | 'otherSpot'
  | 'postflopPending'
  | 'multiwayPostflop'
  | 'unknownRange'
  | 'limpRange'
  | 'deepRange'
  | 'shortRange';

export const UNRATED_TEXT: Record<UnratedReason, string> = {
  tableSize: 'Tischgröße',
  positions: 'Positionen nicht erkannt',
  noHoleCards: 'Keine Hole Cards',
  limp: 'Limp oder Limp-Pot',
  multiway: 'Mehrere Caller vor dir',
  squeeze: 'Squeeze',
  multiRaise: 'Mehrere Raises vor dir',
  deepPot: '4-Bet-Pot und tiefer',
  shortNotPushFold: 'Spot mit höchstens 20 BB (kein Push/Fold-Spot)',
  deepAllIn: 'All-in mit mehr als 20 BB (kein Chart-Spot)',
  otherSpot: 'Spot vom Modell nicht abgedeckt',
  postflopPending: 'Postflop-Bewertung folgt',
  multiwayPostflop: 'Multiway',
  unknownRange: 'Range des Gegners unbekannt',
  limpRange: 'Range des Gegners unbekannt: Limp-Pot',
  deepRange: 'Range des Gegners unbekannt: 4-Bet-Pot',
  shortRange: 'Range des Gegners unbekannt: höchstens 20 BB (kein Chart)',
};

export type PushFoldRating = { model: 'pushfold'; spot: Spot; chosen: Action; grade: Grade; effectiveBb: number };
export type ChartRating = {
  model: 'chart';
  spot: PreflopSpot;
  chosen: PreflopAction;
  grade: PreflopGrade;
  effectiveBb: number;
  /** True when the effective stack is more than 25 % away from the chart depth. */
  approximation: boolean;
};
export type UnratedRating = { model: 'unrated'; reason: UnratedReason };
/** Plan 8 adds a postflop rating to this union; Plan 7 never creates one. */
export type DecisionRating = PushFoldRating | ChartRating | UnratedRating;

export type ModelChoice = { model: 'pushfold'; stack: number } | { model: 'chart'; depth: StackDepth; approximation: boolean };

export function modelFor(effectiveBb: number): ModelChoice {
  const rounded = Math.round(effectiveBb);
  if (rounded <= PUSHFOLD_MAX_BB) return { model: 'pushfold', stack: Math.max(MIN_STACK, rounded) };
  const depth: StackDepth = rounded <= CHART_40_MAX_BB ? 40 : 100;
  return { model: 'chart', depth, approximation: Math.abs(effectiveBb - depth) / depth > APPROXIMATION_SHARE };
}

const AGGRESSIVE: Record<PreflopKind, PreflopAction> = { rfi: 'raise', vsOpen: 'threeBet', vs3bet: 'fourBet' };
const unrated = (reason: UnratedReason): UnratedRating => ({ model: 'unrated', reason });

/**
 * Rates one preflop decision of the hero. `index` is the event index of the hero's action,
 * `state` the table right before it.
 */
export function ratePreflopDecision(
  hand: ParsedHand,
  index: number,
  state: TableState,
  positions: ReadonlyMap<string, Position> | null,
  data: PushFoldData,
): DecisionRating {
  if (hand.tableSize !== 8) return unrated('tableSize');
  if (!positions || !positions.has(HERO)) return unrated('positions');
  if (!hand.heroCards) return unrated('noHoleCards');
  const event = hand.events[index] as ActionEvent;
  const prior = hand.events.slice(0, index).filter((e): e is ActionEvent => e.type === 'action' && e.street === 'preflop');
  const heroPos = positions.get(HERO)!;
  const hand169 = handClassOf(hand.heroCards[0], hand.heroCards[1]);
  const stackOf = (name: string) => playableChips(hand, name);
  const bb = hand.bigBlind;
  const heroStack = stackOf(HERO);
  const pos = (name: string) => positions.get(name)!;
  const isShove = (act: ActionEvent, committedAfter: number) => act.allIn || committedAfter >= SHOVE_SHARE * stackOf(act.player);
  const heroCommittedAfter = state.players.find((p) => p.isHero)!.streetBet + event.amount;
  const heroShoves = event.action !== 'fold' && isShove(event, heroCommittedAfter);

  const raises = prior.filter((e) => e.action === 'raise' || e.action === 'bet');
  const firstRaise = prior.findIndex((e) => e.action === 'raise' || e.action === 'bet');
  const limped = prior.some((e, i) => e.action === 'call' && (firstRaise < 0 || i < firstRaise));
  const heroBefore = prior.filter((e) => e.player === HERO);

  const chart = (kind: PreflopKind, villain: Position | null, effectiveBb: number, depth: StackDepth, approximation: boolean): DecisionRating => {
    if (event.action === 'check') return unrated('otherSpot');
    const chosen: PreflopAction =
      event.action === 'fold' ? 'fold' : event.action === 'call' ? 'call' : AGGRESSIVE[kind];
    if (kind === 'rfi' && chosen === 'call') return unrated('limp');
    const spot: PreflopSpot = { kind, stack: depth, hero: heroPos, villain, hand: hand169 };
    try {
      chartKeyFor(spot);
    } catch {
      return unrated('otherSpot');
    }
    return { model: 'chart', spot, chosen, grade: gradePreflop(spot, chosen), effectiveBb, approximation };
  };

  if (heroBefore.length === 0) {
    if (raises.length === 0) {
      if (limped || event.action === 'check') return unrated('limp');
      const behind = state.players.filter((p) => !p.isHero && p.position !== null && seatOf(p.position) > seatOf(heroPos));
      if (behind.length === 0) return unrated('otherSpot');
      const villainStack = Math.max(...behind.map((p) => stackOf(p.name)));
      const effectiveBb = Math.min(heroStack, villainStack) / bb;
      const model = modelFor(effectiveBb);
      if (model.model === 'pushfold') {
        if (event.action === 'call') return unrated('limp');
        if (event.action !== 'fold' && !heroShoves) return unrated('shortNotPushFold');
        const spot: Spot = { kind: 'open', position: heroPos, stack: model.stack, hand: hand169 };
        const chosen: Action = event.action === 'fold' ? 'fold' : 'shove';
        return { model: 'pushfold', spot, chosen, grade: grade(data, spot, chosen), effectiveBb };
      }
      return chart('rfi', null, effectiveBb, model.depth, model.approximation);
    }
    if (raises.length === 1) {
      if (limped) return unrated('limp');
      const raise = raises[0];
      const coldCallers = prior.slice(firstRaise + 1).filter((e) => e.action === 'call');
      if (coldCallers.length > 0) return unrated(event.action === 'raise' ? 'squeeze' : 'multiway');
      const effectiveBb = Math.min(heroStack, stackOf(raise.player)) / bb;
      const model = modelFor(effectiveBb);
      const raiserCommitted = raise.to ?? raise.amount;
      if (isShove(raise, raiserCommitted)) {
        if (model.model !== 'pushfold') return unrated('deepAllIn');
        const spot: Spot = { kind: 'call', shover: pos(raise.player), position: heroPos, stack: model.stack, hand: hand169 };
        const chosen: Action = event.action === 'fold' ? 'fold' : 'call';
        return { model: 'pushfold', spot, chosen, grade: grade(data, spot, chosen), effectiveBb };
      }
      if (model.model === 'pushfold') return unrated('shortNotPushFold');
      return chart('vsOpen', pos(raise.player), effectiveBb, model.depth, model.approximation);
    }
    return unrated('multiRaise');
  }

  if (limped) return unrated('limp');
  if (raises.length >= 3) return unrated('deepPot');
  const heroOpen = heroBefore.length === 1 && heroBefore[0].action === 'raise' && raises[0] === heroBefore[0];
  if (heroOpen && raises.length === 2) {
    const threeBet = raises[1];
    const after = prior.slice(prior.indexOf(heroBefore[0]) + 1);
    if (after.some((e) => e.action === 'call')) return unrated('multiway');
    const effectiveBb = Math.min(heroStack, stackOf(threeBet.player)) / bb;
    const model = modelFor(effectiveBb);
    if (model.model === 'pushfold') return unrated('shortNotPushFold');
    // A 3-bet shove, or a call that would put the hero all-in, is no chart spot.
    const threeBetTo = threeBet.to ?? threeBet.amount;
    if (isShove(threeBet, threeBetTo) || threeBetTo >= SHOVE_SHARE * heroStack) return unrated('deepAllIn');
    return chart('vs3bet', pos(threeBet.player), effectiveBb, model.depth, model.approximation);
  }
  return unrated('multiRaise');
}
