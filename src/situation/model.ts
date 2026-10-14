import type { Card } from '../engine/cards';
import { POSITIONS, type Position, seatOf } from '../engine/positions';
import { FOUR_BET, OPEN_RAISE, SB_OPEN_RAISE, THREE_BET_BLINDS, THREE_BET_IP } from '../engine/preflop/spots';
import type { PlayerState, TableState } from '../review/hand-model';
import { type ActionEvent, type BoardStreet, HERO, type HandEvent, type Street } from '../review/parse';
import { SITUATION_HAND_PREFIX } from '../review/situation-tournaments';
import { type TournamentKind, isTournamentKind } from '../review/tournament-kind';

/** Spec 4: the generated hand uses 800 chips per BB (small blind 400, ante 100 per seated player). */
export const CHIPS_PER_BB = 800;
export const SMALL_BLIND_CHIPS = 400;
export const ANTE_CHIPS = 100;
export const MIN_STACK_BB = 1;
export const MAX_STACK_BB = 200;
/** Bet sizes and stacks are entered in steps of 0.1 BB = 80 chips. */
export const CHIPS_PER_STEP = CHIPS_PER_BB / 10;
/** The last seat that may stay empty: BTN, SB and BB always play (no dead button, no missing blind). */
export const LAST_EMPTY_SEAT = seatOf('CO');

export const bbToChips = (bb: number): number => Math.round(bb * 10) * CHIPS_PER_STEP;
export const chipsToBb = (chips: number): number => chips / CHIPS_PER_BB;
export const isStackBb = (bb: number): boolean =>
  Number.isFinite(bb) && bb >= MIN_STACK_BB && bb <= MAX_STACK_BB && Math.abs(bb * 10 - Math.round(bb * 10)) < 1e-9;

export type SituationSetup = {
  /** "SIT" + digits; stays the same for the whole situation (the postflop equities are seeded with it). */
  handId: string;
  kind: TournamentKind;
  hero: Position;
  heroCards: readonly [Card, Card];
  /** Chips at the start of the hand (before the ante) per position, in BB: 1–200 in steps of 0.1. */
  stacks: Readonly<Record<Position, number>>;
};

/** `to` is the street total of a bet or raise in chips; anything at or above the stack is the all-in. */
export type SituationStep =
  | { type: 'empty' }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'board'; cards: readonly Card[] }
  | { type: 'show'; position: Position; cards: readonly [Card, Card] }
  | { type: 'end' };

export type Situation = { setup: SituationSetup; steps: readonly SituationStep[] };

/** Street totals in chips; `max` is the all-in. */
export type BetRange = { min: number; max: number };

export type LegalActions = {
  position: Position;
  isHero: boolean;
  fold: boolean;
  check: boolean;
  /** What a call adds; null without a bet to call. */
  call: { amount: number; allIn: boolean } | null;
  /** Postflop without a bet so far. */
  bet: BetRange | null;
  raise: BetRange | null;
  /** "Platz leer": only for the first seats in playing order, before the hero, up to the cutoff. */
  empty: boolean;
  /** The usual size for a bet or raise (street total in chips), null when neither is possible. */
  suggested: number | null;
};

export type Phase =
  | { type: 'act'; legal: LegalActions }
  | { type: 'board'; street: BoardStreet; count: 1 | 3; optional: boolean }
  | { type: 'done'; reason: 'folded' | 'heroFolded' | 'showdown' };

export type SituationState = {
  setup: SituationSetup;
  phase: Phase;
  /** Seated positions in seat order (UTG first). */
  seated: Position[];
  events: HandEvent[];
  /** `states[i]` is the table right before `events[i]`; the last entry is the table now (as `walkHand` builds it). */
  states: TableState[];
  table: TableState;
  /** Event index of every hero action, in order. */
  heroEvents: number[];
  /** Villains still in the hand at the showdown whose cards were not entered yet. */
  showable: Position[];
  /** Hero cards, board and shown cards. */
  usedCards: Card[];
};

export class IllegalStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStepError';
  }
}

const illegal = (message: string): never => {
  throw new IllegalStepError(message);
};

/** Player names in the generated hand: "Hero" and one neutral name per seat. */
export const playerName = (setup: SituationSetup, position: Position): string =>
  position === setup.hero ? HERO : `Spieler${seatOf(position) + 1}`;

const NEXT_STREET: Record<Street, BoardStreet | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };
const isCard = (c: unknown): c is Card => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < 52;

function checkSetup(setup: SituationSetup): void {
  if (!new RegExp(`^${SITUATION_HAND_PREFIX}\\d+$`).test(setup.handId)) illegal('Hand-ID ungültig');
  if (!isTournamentKind(setup.kind)) illegal('Turnierart ungültig');
  if (!POSITIONS.includes(setup.hero)) illegal('Position ungültig');
  const [a, b] = setup.heroCards;
  if (!isCard(a) || !isCard(b) || a === b) illegal('Karten ungültig');
  for (const p of POSITIONS) if (!isStackBb(setup.stacks[p])) illegal(`Stack ${p} ungültig`);
}

/** The table as it is played, step by step; snapshots match `walkHand` exactly. */
class Table {
  readonly players: PlayerState[];
  readonly events: HandEvent[] = [];
  readonly states: TableState[];
  street: Street = 'preflop';
  pot = 0;
  board: Card[] = [];
  lastAggressor: string | null = null;
  /** Highest street total so far and the size of the last full raise (both chips). */
  maxBet = 0;
  lastRaise = CHIPS_PER_BB;
  /** Players who acted since the street began or since the last full raise. */
  acted = new Set<string>();
  lastActor: string | null = null;
  closed = false;
  collected = false;
  ended = false;
  shown = new Set<string>();
  anyAction = false;

  constructor(
    readonly setup: SituationSetup,
    readonly seated: Position[],
  ) {
    this.players = seated.map((position) => {
      const chips = bbToChips(setup.stacks[position]);
      return {
        name: playerName(setup, position),
        seat: seatOf(position) + 1,
        position,
        startChips: chips,
        stack: chips,
        streetBet: 0,
        folded: false,
        allIn: false,
        isHero: position === setup.hero,
      };
    });
    this.states = [this.snapshot()];
    for (const p of this.players) this.post(p, 'ante', ANTE_CHIPS);
    this.post(this.byPosition('SB'), 'smallBlind', SMALL_BLIND_CHIPS);
    this.post(this.byPosition('BB'), 'bigBlind', CHIPS_PER_BB);
    this.maxBet = Math.max(...this.players.map((p) => p.streetBet));
  }

  byPosition(position: Position): PlayerState {
    return this.players.find((p) => p.position === position)!;
  }

  snapshot(): TableState {
    return {
      street: this.street,
      pot: this.pot,
      board: [...this.board],
      players: this.players.map((p) => ({ ...p })),
      lastAggressor: this.lastAggressor,
    };
  }

  push(event: HandEvent): void {
    this.events.push(event);
    this.states.push(this.snapshot());
  }

  /** Puts chips in; returns whether the player is all-in now. */
  pay(p: PlayerState, amount: number, street: boolean): boolean {
    p.stack -= amount;
    if (street) p.streetBet += amount;
    this.pot += amount;
    if (p.stack === 0) p.allIn = true;
    return p.stack === 0;
  }

  post(p: PlayerState, type: 'ante' | 'smallBlind' | 'bigBlind', amount: number): void {
    const paid = Math.min(amount, p.stack);
    const allIn = this.pay(p, paid, type !== 'ante');
    this.push({ type, player: p.name, amount: paid, allIn });
  }

  active(): PlayerState[] {
    return this.players.filter((p) => !p.folded);
  }

  othersCanAct(p: PlayerState): boolean {
    return this.players.some((q) => q !== p && !q.folded && q.stack > 0);
  }

  needsToAct(p: PlayerState): boolean {
    if (p.folded || p.stack === 0) return false;
    return p.streetBet < this.maxBet || (!this.acted.has(p.name) && this.othersCanAct(p));
  }

  /** Preflop UTG … BB, postflop SB, BB, then UTG … BTN. */
  order(): PlayerState[] {
    if (this.street === 'preflop') return this.players;
    const blinds = this.players.filter((p) => p.position === 'SB' || p.position === 'BB');
    return [...blinds, ...this.players.filter((p) => p.position !== 'SB' && p.position !== 'BB')];
  }

  nextToAct(): PlayerState | null {
    const order = this.order();
    const last = this.lastActor === null ? -1 : order.findIndex((p) => p.name === this.lastActor);
    for (let k = 1; k <= order.length; k++) {
      const p = order[(last + k) % order.length];
      if (this.needsToAct(p)) return p;
    }
    return null;
  }

  heroFolded(): boolean {
    return this.players.some((p) => p.isHero && p.folded);
  }

  legal(p: PlayerState): LegalActions {
    const toCall = Math.max(0, this.maxBet - p.streetBet);
    const aggressive = p.stack > toCall && !this.acted.has(p.name) && this.othersCanAct(p);
    const max = p.streetBet + p.stack;
    let bet: BetRange | null = null;
    let raise: BetRange | null = null;
    if (aggressive && this.maxBet === 0) bet = { min: Math.min(CHIPS_PER_BB, max), max };
    if (aggressive && this.maxBet > 0) {
      const base = this.street === 'preflop' ? Math.max(this.maxBet, CHIPS_PER_BB) : this.maxBet;
      raise = { min: Math.min(base + this.lastRaise, max), max };
    }
    const seat = seatOf(p.position!);
    const legal: LegalActions = {
      position: p.position!,
      isHero: p.isHero,
      fold: toCall > 0,
      check: toCall === 0,
      call: toCall > 0 ? { amount: Math.min(toCall, p.stack), allIn: p.stack <= toCall } : null,
      bet,
      raise,
      empty: !this.anyAction && seat < seatOf(this.setup.hero) && seat <= LAST_EMPTY_SEAT,
      suggested: null,
    };
    legal.suggested = suggestedSize(this, p, legal);
    return legal;
  }

  /** The street is over: a bet nobody matched goes back (GGPoker writes "Uncalled bet … returned to …"). */
  close(): void {
    this.closed = true;
    const sorted = [...this.players].sort((a, b) => b.streetBet - a.streetBet);
    const [top, second] = sorted;
    const excess = top.streetBet - (second?.streetBet ?? 0);
    if (excess <= 0) return;
    top.stack += excess;
    top.streetBet -= excess;
    this.pot -= excess;
    if (top.stack > 0) top.allIn = false;
    this.push({ type: 'uncalled', player: top.name, amount: excess });
  }

  phase(): Phase {
    const active = this.active();
    if (active.length > 1 && this.heroFolded()) return { type: 'done', reason: 'heroFolded' };
    const next = active.length > 1 ? this.nextToAct() : null;
    if (next) return { type: 'act', legal: this.legal(next) };
    if (!this.closed) this.close();
    if (active.length === 1) {
      if (!this.collected) {
        this.collected = true;
        this.push({ type: 'collect', player: active[0].name, amount: this.pot });
      }
      return { type: 'done', reason: 'folded' };
    }
    const street = NEXT_STREET[this.street];
    if (street === null || this.ended) return { type: 'done', reason: 'showdown' };
    const canBet = active.filter((p) => p.stack > 0).length;
    return { type: 'board', street, count: street === 'flop' ? 3 : 1, optional: canBet <= 1 };
  }

  act(p: PlayerState, step: SituationStep, legal: LegalActions): void {
    const event = (action: ActionEvent['action'], amount: number, to: number | null): void => {
      const allIn = amount > 0 && this.pay(p, amount, true);
      if (action === 'fold') p.folded = true;
      this.acted.add(p.name);
      this.lastActor = p.name;
      this.anyAction = true;
      if (action === 'bet' || action === 'raise') this.lastAggressor = p.name;
      this.push({ type: 'action', street: this.street, player: p.name, action, amount, to, allIn });
    };
    switch (step.type) {
      case 'fold':
        if (!legal.fold) illegal('Fold ist hier nicht möglich');
        return event('fold', 0, null);
      case 'check':
        if (!legal.check) illegal('Check gegen einen Einsatz ist nicht möglich');
        return event('check', 0, null);
      case 'call':
        if (!legal.call) illegal('Kein Einsatz zum Callen');
        return event('call', legal.call!.amount, null);
      case 'bet':
      case 'raise': {
        const range = step.type === 'bet' ? legal.bet : legal.raise;
        if (!range) illegal(step.type === 'bet' ? 'Bet ist hier nicht möglich' : 'Raise ist hier nicht möglich');
        const to = Math.min(step.to, range!.max);
        if (!Number.isInteger(to) || to < range!.min) illegal('Einsatz unter dem Minimum');
        const raised = to - this.maxBet;
        if (raised >= this.lastRaise) {
          // A full bet or raise: everybody else may raise again. An all-in below that reopens nothing.
          this.lastRaise = raised;
          this.acted.clear();
        }
        this.maxBet = to;
        return event(step.type, to - p.streetBet, step.type === 'raise' ? to : null);
      }
      default:
        illegal('Jetzt ist eine Aktion dran');
    }
  }

  dealBoard(street: BoardStreet, cards: readonly Card[]): void {
    for (const p of this.players) p.streetBet = 0;
    this.street = street;
    this.board.push(...cards);
    this.lastAggressor = null;
    this.maxBet = 0;
    this.lastRaise = CHIPS_PER_BB;
    this.acted.clear();
    this.lastActor = null;
    this.closed = false;
    this.push({ type: 'board', street, cards: [...cards] });
  }

  used(): Card[] {
    const shown = this.events.flatMap((e) => (e.type === 'show' ? e.cards : []));
    return [...this.setup.heroCards, ...this.board, ...shown];
  }
}

const roundToStep = (chips: number): number => Math.round(chips / CHIPS_PER_STEP) * CHIPS_PER_STEP;

/**
 * The usual size, as in the training: open 2.2 BB (SB 3 BB) plus 1 BB per limper, 3-bet 3× (from the blinds 4×),
 * 4-bet and later 2.2×; postflop a bet of half the pot and a raise to three times the bet.
 */
function suggestedSize(table: Table, p: PlayerState, legal: LegalActions): number | null {
  const range = legal.bet ?? legal.raise;
  if (!range) return null;
  let size: number;
  if (table.street === 'preflop') {
    const actions = table.events.filter((e): e is ActionEvent => e.type === 'action');
    const raises = actions.filter((e) => e.action === 'raise');
    if (raises.length === 0) {
      const limpers = actions.filter((e) => e.action === 'call').length;
      size = ((p.position === 'SB' ? SB_OPEN_RAISE : OPEN_RAISE) + limpers) * CHIPS_PER_BB;
    } else {
      const factor = raises.length >= 2 ? FOUR_BET : p.position === 'SB' || p.position === 'BB' ? THREE_BET_BLINDS : THREE_BET_IP;
      size = table.maxBet * factor;
    }
  } else {
    size = legal.bet ? table.pot / 2 : table.maxBet * 3;
  }
  return Math.min(range.max, Math.max(range.min, roundToStep(size)));
}

/** Replays the situation; throws `IllegalStepError` for a step that is not possible at its point. */
export function playSituation(situation: Situation): SituationState {
  const { setup, steps } = situation;
  checkSetup(setup);
  let empties = 0;
  while (steps[empties]?.type === 'empty') empties++;
  for (let seat = 0; seat < empties; seat++) {
    if (seat >= seatOf(setup.hero) || seat > LAST_EMPTY_SEAT) illegal('Dieser Platz kann nicht leer sein');
  }
  const seated = POSITIONS.slice(empties);
  const table = new Table(setup, [...seated]);
  let phase = table.phase();
  for (const step of steps.slice(empties)) {
    if (step.type === 'end') {
      if (phase.type !== 'board' || !phase.optional) illegal('Die Hand ist noch nicht vorbei');
      table.ended = true;
    } else if (step.type === 'board') {
      if (phase.type !== 'board') illegal('Jetzt kommen keine Board-Karten');
      const { street, count } = phase as Extract<Phase, { type: 'board' }>;
      const used = new Set(table.used());
      const cards = step.cards;
      if (cards.length !== count || !cards.every(isCard) || new Set(cards).size !== count || cards.some((c) => used.has(c))) {
        illegal('Board-Karten ungültig');
      }
      table.dealBoard(street, cards);
    } else if (step.type === 'show') {
      if (phase.type !== 'done' || phase.reason !== 'showdown') illegal('Karten zeigen geht erst am Ende');
      const p = table.players.find((x) => x.position === step.position);
      if (!p || p.isHero || p.folded || table.shown.has(p.name)) illegal('Dieser Spieler kann keine Karten zeigen');
      const used = new Set(table.used());
      const [a, b] = step.cards;
      if (!isCard(a) || !isCard(b) || a === b || used.has(a) || used.has(b)) illegal('Karten ungültig');
      table.shown.add(p!.name);
      table.push({ type: 'show', player: p!.name, cards: [a, b] });
    } else {
      if (phase.type !== 'act') illegal('Jetzt ist keine Aktion dran');
      const { legal } = phase as Extract<Phase, { type: 'act' }>;
      if (step.type === 'empty') illegal('Dieser Platz kann nicht leer sein');
      table.act(table.byPosition(legal.position), step, legal);
    }
    phase = table.phase();
  }
  const heroEvents = table.events.flatMap((e, i) => (e.type === 'action' && e.player === HERO ? [i] : []));
  const showable =
    phase.type === 'done' && phase.reason === 'showdown'
      ? table.players.filter((p) => !p.isHero && !p.folded && !table.shown.has(p.name)).map((p) => p.position!)
      : [];
  return {
    setup,
    phase,
    seated: [...seated],
    events: table.events,
    states: table.states,
    table: table.states[table.states.length - 1],
    heroEvents,
    showable,
    usedCards: table.used(),
  };
}

/** The situation with one more step; throws `IllegalStepError` when the step is not possible. */
export function addStep(situation: Situation, step: SituationStep): Situation {
  const next = { setup: situation.setup, steps: [...situation.steps, step] };
  playSituation(next);
  return next;
}

/** "← Zurück": the last step taken back. */
export const undoStep = (situation: Situation): Situation => ({ setup: situation.setup, steps: situation.steps.slice(0, -1) });

/** The situation up to and including the hero's last action (for the live rating); null before his first action. */
export function upToLastHeroAction(situation: Situation): Situation | null {
  const state = playSituation(situation);
  if (state.heroEvents.length === 0) return null;
  for (let n = situation.steps.length; n > 0; n--) {
    const shorter = { setup: situation.setup, steps: situation.steps.slice(0, n - 1) };
    if (playSituation(shorter).heroEvents.length < state.heroEvents.length) return { setup: situation.setup, steps: situation.steps.slice(0, n) };
  }
  return situation;
}
