import { formatChipsBb, reviewActionLabel, streetLabel } from '../app/format';
import { cardName } from '../engine/cards';
import { POSITIONS, POSITION_LABELS, seatOf } from '../engine/positions';
import type { HeroDecision } from '../review/analysis';
import { type PlayerState, type TableState, walkHand } from '../review/hand-model';
import type { ActionEvent, HandEvent, ParsedHand } from '../review/parse';
import type { SeatModel, SeatRole, TableModel } from './table-model';

export type ReplayStep = {
  /** Null for the start (cards dealt, blinds and antes posted). */
  eventIndex: number | null;
  /** The table shown for this step: before a hero action (the spot he faced), after every other event. */
  state: TableState;
  text: string;
  /** Set when the step is a hero decision. */
  decision: HeroDecision | null;
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const isPost = (e: HandEvent) => e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind';

function nameOf(state: TableState, player: string): string {
  const p = state.players.find((x) => x.name === player);
  if (!p) return player;
  if (p.isHero) return 'Du';
  return p.position ? POSITION_LABELS[p.position] : player;
}

const isHeroName = (state: TableState, player: string) => state.players.some((x) => x.name === player && x.isHero);

export function describeEvent(event: HandEvent, state: TableState, bigBlind: number): string {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  switch (event.type) {
    case 'action':
      return `${nameOf(state, event.player)}: ${reviewActionLabel(event, bigBlind)}`;
    case 'board':
      return `${streetLabel(event.street)}: ${event.cards.map(cardName).join(' ')}`;
    case 'uncalled':
      return `${nameOf(state, event.player)}: ${bb(event.amount)} zurück`;
    case 'show':
      return `${nameOf(state, event.player)} ${isHeroName(state, event.player) ? 'zeigst' : 'zeigt'} ${event.cards.map(cardName).join(' ')}`;
    case 'collect':
      return `${nameOf(state, event.player)} ${isHeroName(state, event.player) ? 'gewinnst' : 'gewinnt'} ${bb(event.amount)}`;
    default:
      return '';
  }
}

export function replaySteps(hand: ParsedHand, decisions: readonly HeroDecision[]): ReplayStep[] {
  const states = walkHand(hand);
  const firstPlay = hand.events.findIndex((e) => !isPost(e));
  const start = firstPlay < 0 ? states[states.length - 1] : states[firstPlay];
  const steps: ReplayStep[] = [{ eventIndex: null, state: start, text: 'Karten verteilt', decision: null }];
  hand.events.forEach((event, i) => {
    if (isPost(event)) return;
    const decision = decisions.find((d) => d.eventIndex === i) ?? null;
    steps.push({
      eventIndex: i,
      state: decision ? states[i] : states[i + 1],
      text: decision
        ? `Du bist dran – deine Wahl: ${reviewActionLabel(event as ActionEvent, hand.bigBlind)}`
        : describeEvent(event, states[i], hand.bigBlind),
      decision,
    });
  });
  return steps;
}

function roleOf(p: PlayerState, state: TableState): SeatRole {
  if (p.isHero) return 'hero';
  if (p.folded) return 'folded';
  return p.name === state.lastAggressor ? 'raiser' : 'waiting';
}

/** The replay table: only seated players, placed around the hero by their 8-max position. */
export function replayTableModel(state: TableState, bigBlind: number): TableModel {
  const hero = state.players.find((p) => p.isHero);
  const heroSeat = hero?.position ? seatOf(hero.position) : 0;
  // Heads-up the small blind has the button.
  const buttonPosition = state.players.some((p) => p.position === 'BTN') ? 'BTN' : 'SB';
  const seats: SeatModel[] = state.players
    .filter((p) => p.position !== null)
    .map((p) => {
      const position = p.position!;
      return {
        position,
        label: POSITION_LABELS[position],
        role: roleOf(p, state),
        offset: (seatOf(position) - heroSeat + POSITIONS.length) % POSITIONS.length,
        isButton: position === buttonPosition,
        betBb: round1(p.streetBet / bigBlind),
        anteBb: 0,
        betLabel: p.allIn && p.streetBet > 0 ? 'All-in' : null,
        stackBb: round1(p.stack / bigBlind),
      };
    });
  return {
    seats,
    playersBehind: 0,
    potBb: round1(state.pot / bigBlind),
    heroStackBb: round1((hero?.stack ?? 0) / bigBlind),
  };
}
