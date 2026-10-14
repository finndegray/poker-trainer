import { parseCard } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import { positionsOf } from '../review/hand-model';
import { HERO, type ParsedHand } from '../review/parse';
import type { TournamentKind } from '../review/tournament-kind';
import { IllegalStepError, MAX_STACK_BB, MIN_STACK_BB, type Situation, type SituationStep, addStep, bbToChips, playSituation } from './model';

export const TEST_PLAYED_AT = '2026-10-14 18:05:09';
export const TEST_HAND_ID = 'SIT1760457909000';

export const sameStacks = (bb: number): Record<Position, number> =>
  Object.fromEntries(POSITIONS.map((p) => [p, bb])) as Record<Position, number>;

/** 72o open-raised from UTG with 40 BB, everybody folds: one preflop chart error ("falsch"), hero action = event 10. */
export function sevenTwoOpen(kind: TournamentKind = 'normal', handId = TEST_HAND_ID): Situation {
  const steps: SituationStep[] = [{ type: 'raise', to: bbToChips(2.2) }, ...Array.from({ length: 7 }, () => ({ type: 'fold' }) as const)];
  return { setup: { handId, kind, hero: 'UTG', heroCards: [parseCard('7c'), parseCard('2d')], stacks: sameStacks(40) }, steps };
}

const roundBb = (chips: number, bigBlind: number) => Math.min(MAX_STACK_BB, Math.max(MIN_STACK_BB, Math.round((chips / bigBlind) * 10) / 10));

/**
 * A GGPoker hand entered again through the situation model, the way a player would type it in: stacks and sizes in
 * BB rounded to 0.1, all-ins as all-ins, missing players as empty first seats. Null for hands the model cannot take
 * (no 8-max table, fewer than three players, no hero cards).
 */
export function situationFromHand(hand: ParsedHand, kind: TournamentKind = 'normal', handId = TEST_HAND_ID): Situation | null {
  const positions = positionsOf(hand);
  if (!positions || hand.tableSize !== 8 || hand.seats.length < 3 || !hand.heroCards) return null;
  const stacks = sameStacks(MIN_STACK_BB);
  for (const seat of hand.seats) stacks[positions.get(seat.name)!] = roundBb(seat.chips, hand.bigBlind);
  // positionsOf counts back from the button, so the missing players are always the first seats.
  const empty = Array.from({ length: 8 - hand.seats.length }, (): SituationStep => ({ type: 'empty' }));
  let situation: Situation = { setup: { handId, kind, hero: positions.get(HERO)!, heroCards: hand.heroCards, stacks }, steps: empty };
  for (const event of hand.events) {
    let step: SituationStep | null = null;
    if (event.type === 'board') step = { type: 'board', cards: event.cards };
    if (event.type === 'action') {
      if (event.action === 'bet' || event.action === 'raise') {
        const to = event.allIn ? Number.MAX_SAFE_INTEGER : bbToChips((event.to ?? event.amount) / hand.bigBlind);
        step = { type: event.action, to };
      } else step = { type: event.action };
    }
    if (!step) continue;
    const phase = playSituation(situation).phase;
    // After the hero folded the model stops; the rest of the hand does not change his decisions.
    if (phase.type === 'done') break;
    // The model must ask the same player GGPoker shows (stacks rounded to 0.1 BB could change who is all-in).
    if (event.type === 'action' && (phase.type !== 'act' || phase.legal.position !== positions.get(event.player))) return null;
    try {
      situation = addStep(situation, step);
    } catch (error) {
      if (!(error instanceof IllegalStepError) || (step.type !== 'bet' && step.type !== 'raise')) return null;
      // Rounded to 0.1 BB, a min-raise can end up just below the minimum: take the minimum.
      const range = phase.type === 'act' ? (phase.legal.bet ?? phase.legal.raise) : null;
      if (!range) return null;
      situation = addStep(situation, { type: step.type, to: range.min });
    }
  }
  return situation;
}
