import type { Card } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import { HERO, type HandEvent, type ParsedHand, type Street, postOf } from './parse';

const NON_BLIND: readonly Position[] = POSITIONS.slice(0, 6);

/**
 * Maps players to the 8-max positions of the trainer. The blinds come from the posts; the other players are
 * counted back from the button, so a short-handed table keeps BTN, CO, HJ … and drops UTG first.
 * Null when the blinds are missing or more than six players sit outside the blinds.
 */
export function positionsOf(hand: ParsedHand): Map<string, Position> | null {
  const sb = postOf(hand, 'smallBlind')?.player;
  const bb = postOf(hand, 'bigBlind')?.player;
  if (!bb) return null;
  const order = [...hand.seats].sort((a, b) => a.seat - b.seat).map((s) => s.name);
  const start = order.indexOf(bb) + 1;
  const clockwise = [...order.slice(start), ...order.slice(0, start)].filter((n) => n !== bb && n !== sb);
  if (clockwise.length > NON_BLIND.length) return null;
  const out = new Map<string, Position>();
  const labels = NON_BLIND.slice(NON_BLIND.length - clockwise.length);
  clockwise.forEach((name, i) => out.set(name, labels[i]));
  if (sb) out.set(sb, 'SB');
  out.set(bb, 'BB');
  return out;
}

export type PlayerState = {
  name: string;
  seat: number;
  position: Position | null;
  /** Chips at the start of the hand, before the ante. */
  startChips: number;
  /** Chips behind right now. */
  stack: number;
  /** Chips put in on the current street (blinds count on the preflop street). */
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
};

export type TableState = {
  street: Street;
  /** Everything put in so far, current street bets included. */
  pot: number;
  board: Card[];
  players: PlayerState[];
  lastAggressor: string | null;
};

function initialState(hand: ParsedHand, positions: Map<string, Position> | null): TableState {
  return {
    street: 'preflop',
    pot: 0,
    board: [],
    lastAggressor: null,
    players: hand.seats.map((s) => ({
      name: s.name,
      seat: s.seat,
      position: positions?.get(s.name) ?? null,
      startChips: s.chips,
      stack: s.chips,
      streetBet: 0,
      folded: false,
      allIn: false,
      isHero: s.name === HERO,
    })),
  };
}

function applyEvent(state: TableState, event: HandEvent): TableState {
  const players = state.players.map((p) => ({ ...p }));
  const player = (name: string) => players.find((p) => p.name === name)!;
  switch (event.type) {
    case 'ante':
    case 'smallBlind':
    case 'bigBlind':
    case 'action': {
      const p = player(event.player);
      p.stack -= event.amount;
      if (event.type !== 'ante') p.streetBet += event.amount;
      if (event.type === 'action' && event.action === 'fold') p.folded = true;
      if (event.allIn || p.stack === 0) p.allIn = true;
      const aggressive = event.type === 'action' && (event.action === 'bet' || event.action === 'raise');
      return { ...state, players, pot: state.pot + event.amount, lastAggressor: aggressive ? event.player : state.lastAggressor };
    }
    case 'uncalled': {
      const p = player(event.player);
      p.stack += event.amount;
      p.streetBet -= event.amount;
      if (p.stack > 0) p.allIn = false;
      return { ...state, players, pot: state.pot - event.amount };
    }
    case 'board':
      for (const p of players) p.streetBet = 0;
      return { ...state, players, street: event.street, board: [...state.board, ...event.cards], lastAggressor: null };
    case 'show':
    case 'collect':
      return state;
  }
}

/** `states[i]` is the table right before `hand.events[i]`; the last entry is the table after the final event. */
export function walkHand(hand: ParsedHand, positions: Map<string, Position> | null = positionsOf(hand)): TableState[] {
  const states = [initialState(hand, positions)];
  for (const event of hand.events) states.push(applyEvent(states[states.length - 1], event));
  return states;
}

/** Chips a player can play with in this hand: the start stack minus the ante he posted. */
export function playableChips(hand: ParsedHand, name: string): number {
  const seat = hand.seats.find((s) => s.name === name);
  if (!seat) return 0;
  return seat.chips - (postOf(hand, 'ante', name)?.amount ?? 0);
}

export const maxStreetBet = (state: TableState): number => Math.max(0, ...state.players.map((p) => p.streetBet));
