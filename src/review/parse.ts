import { type Card, parseCard } from '../engine/cards';

export const HERO = 'Hero';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type BoardStreet = Exclude<Street, 'preflop'>;
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type SeatInfo = { seat: number; name: string; chips: number };

/** All amounts are chips. `amount` is what the action adds to the pot; `to` is the street total of a raise. */
export type HandEvent =
  | { type: 'ante' | 'smallBlind' | 'bigBlind'; player: string; amount: number; allIn: boolean }
  | { type: 'action'; street: Street; player: string; action: ActionType; amount: number; to: number | null; allIn: boolean }
  | { type: 'board'; street: BoardStreet; cards: Card[] }
  | { type: 'uncalled'; player: string; amount: number }
  | { type: 'show'; player: string; cards: Card[] }
  | { type: 'collect'; player: string; amount: number };

export type PostEvent = Extract<HandEvent, { type: 'ante' | 'smallBlind' | 'bigBlind' }>;
export type ActionEvent = Extract<HandEvent, { type: 'action' }>;

export type ParsedHand = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** As printed by GGPoker, e.g. "2026-10-13 15:46:28"; no time zone conversion. */
  playedAt: string;
  dateKey: string;
  tableSize: number;
  buttonSeat: number;
  seats: SeatInfo[];
  /** Null when the history has no "Dealt to Hero [..]" line. */
  heroCards: [Card, Card] | null;
  events: HandEvent[];
  board: Card[];
  totalPot: number;
  /** The hand text with LF line endings, as stored in the archive. */
  raw: string;
};

export type SkippedHand = { id: string | null; reason: string };
export type ParseResult = { hands: ParsedHand[]; skipped: SkippedHand[] };

/** The first post of this kind by `player` (any player when omitted). */
export function postOf(hand: ParsedHand, type: PostEvent['type'], player?: string): PostEvent | undefined {
  return hand.events.find((e): e is PostEvent => e.type === type && (player === undefined || e.player === player));
}

export class HandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandParseError';
  }
}

// Hand ids: "TM…" from GGPoker, "SIT…" for situations entered in the app; their tournaments are "SIT-<kind>".
const HEADER =
  /^Poker Hand #((?:TM|SIT)\d+): Tournament #(\d+|SIT-(?:normal|satellit|bounty)), (.+) Hold'em No Limit - Level(\d+)\(([\d,]+)\/([\d,]+)(?:\(([\d,]+)\))?\) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/;
const TABLE = /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/;
const SEAT = /^Seat (\d+): (\S+) \(([\d,]+) in chips\)$/;
const POST = /^(\S+): posts (the ante|small blind|big blind) ([\d,]+)( and is all-in)?$/;
const DEALT = /^Dealt to (\S+)(?: \[([^\]]*)\])?\s*$/;
const ACTION = /^(\S+): (folds|checks|calls ([\d,]+)|bets ([\d,]+)|raises ([\d,]+) to ([\d,]+))( and is all-in)?$/;
const STREET = /^\*\*\* (FLOP|TURN|RIVER) \*\*\* (?:\[[^\]]*\] )?\[([^\]]+)\]$/;
const UNCALLED = /^Uncalled bet \(([\d,]+)\) returned to (\S+)$/;
const SHOWS = /^(\S+): shows \[([^\]]*)\]/;
const COLLECTED = /^(\S+) collected ([\d,]+) from pot$/;
const TOTAL = /^Total pot ([\d,]+)/;
const HAND_ID = /^Poker Hand #(\w+)/;

const chips = (text: string): number => Number(text.replace(/,/g, ''));
const fail = (reason: string): never => {
  throw new HandParseError(reason);
};

function cards(text: string): Card[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  try {
    return parts.map(parseCard);
  } catch {
    return fail('Karten nicht lesbar');
  }
}

export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Splits a history file or pasted text into hand texts; anything before the first header is returned as `rest`. */
export function splitHands(text: string): { hands: string[]; rest: string } {
  const parts = normalizeText(text).split(/\n(?=Poker Hand #)/);
  const rest = parts[0].startsWith('Poker Hand #') ? '' : parts.shift()!.trim();
  return { hands: parts.map((p) => p.trim()).filter(Boolean), rest };
}

const STREET_NAMES: Record<string, BoardStreet> = { FLOP: 'flop', TURN: 'turn', RIVER: 'river' };

export function parseHand(text: string): ParsedHand {
  const raw = normalizeText(text).trim();
  const lines = raw.split('\n').map((l) => l.trimEnd());
  const header = HEADER.exec(lines[0] ?? '');
  if (!header) fail('Format nicht erkannt');
  const [, id, tournamentId, tournamentName, level, sb, bb, ante, year, month, day, time] = header!;
  const table = TABLE.exec(lines[1] ?? '');
  if (!table) fail('Format nicht erkannt');

  const seats: SeatInfo[] = [];
  let i = 2;
  for (; i < lines.length; i++) {
    const m = SEAT.exec(lines[i]);
    if (!m) break;
    seats.push({ seat: Number(m[1]), name: m[2], chips: chips(m[3]) });
  }
  if (seats.length < 2) fail('Format nicht erkannt');
  if (!seats.some((s) => s.name === HERO)) fail('kein Hero');
  const names = new Set(seats.map((s) => s.name));
  const remaining = new Map(seats.map((s) => [s.name, s.chips]));
  const known = (name: string): string => (names.has(name) ? name : fail(`unbekannter Spieler ${name}`));

  const events: HandEvent[] = [];
  let heroCards: [Card, Card] | null = null;
  let street: Street | null = null;
  let committed = new Map<string, number>();
  let section: 'posts' | 'betting' | 'end' = 'posts';
  const board: Card[] = [];
  let totalPot: number | null = null;

  const pay = (player: string, amount: number): boolean => {
    const left = (remaining.get(player) ?? 0) - amount;
    if (left < 0) fail(`${player} setzt mehr, als er hat`);
    remaining.set(player, left);
    return left === 0;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    if (section === 'end') {
      const total = TOTAL.exec(line);
      if (total) totalPot = chips(total[1]);
      continue;
    }
    if (line === '*** HOLE CARDS ***') {
      section = 'betting';
      street = 'preflop';
      continue;
    }
    if (line === '*** SHOWDOWN ***') continue;
    if (line === '*** SUMMARY ***') {
      section = 'end';
      continue;
    }
    const post = POST.exec(line);
    if (post && section === 'posts') {
      const player = known(post[1]);
      const amount = chips(post[3]);
      const type = post[2] === 'the ante' ? 'ante' : post[2] === 'small blind' ? 'smallBlind' : 'bigBlind';
      const allIn = pay(player, amount) || post[4] !== undefined;
      if (type !== 'ante') committed.set(player, (committed.get(player) ?? 0) + amount);
      events.push({ type, player, amount, allIn });
      continue;
    }
    if (section !== 'betting' || street === null) fail(`Zeile nicht erkannt: ${line.slice(0, 60)}`);
    const dealt = DEALT.exec(line);
    if (dealt) {
      if (dealt[1] === HERO && dealt[2] !== undefined) {
        const hole = cards(dealt[2]);
        if (hole.length !== 2) fail('Hole Cards nicht lesbar');
        heroCards = [hole[0], hole[1]];
      }
      continue;
    }
    const action = ACTION.exec(line);
    if (action) {
      const player = known(action[1]);
      const verb = action[2].split(' ')[0];
      const before = committed.get(player) ?? 0;
      let type: ActionType;
      let amount = 0;
      let to: number | null = null;
      if (verb === 'folds') type = 'fold';
      else if (verb === 'checks') type = 'check';
      else if (verb === 'calls') {
        type = 'call';
        amount = chips(action[3]);
      } else if (verb === 'bets') {
        type = 'bet';
        amount = chips(action[4]);
      } else {
        type = 'raise';
        to = chips(action[6]);
        amount = to - before;
      }
      if (amount < 0) fail(`Einsatz nicht lesbar: ${line.slice(0, 60)}`);
      committed.set(player, before + amount);
      const allIn = (amount > 0 && pay(player, amount)) || action[7] !== undefined;
      events.push({ type: 'action', street: street!, player, action: type, amount, to, allIn });
      continue;
    }
    const next = STREET.exec(line);
    if (next) {
      const name = STREET_NAMES[next[1]];
      const dealtCards = cards(next[2]);
      board.push(...dealtCards);
      events.push({ type: 'board', street: name, cards: dealtCards });
      street = name;
      committed = new Map();
      continue;
    }
    const uncalled = UNCALLED.exec(line);
    if (uncalled) {
      const player = known(uncalled[2]);
      const amount = chips(uncalled[1]);
      remaining.set(player, (remaining.get(player) ?? 0) + amount);
      committed.set(player, (committed.get(player) ?? 0) - amount);
      events.push({ type: 'uncalled', player, amount });
      continue;
    }
    const shows = SHOWS.exec(line);
    if (shows) {
      events.push({ type: 'show', player: known(shows[1]), cards: cards(shows[2]) });
      continue;
    }
    const collected = COLLECTED.exec(line);
    if (collected) {
      events.push({ type: 'collect', player: known(collected[1]), amount: chips(collected[2]) });
      continue;
    }
    fail(`Zeile nicht erkannt: ${line.slice(0, 60)}`);
  }

  if (street === null) fail('Format nicht erkannt');
  if (totalPot === null) fail('Zusammenfassung fehlt');
  let put = 0;
  for (const e of events) {
    if (e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind' || e.type === 'action') put += e.amount;
    if (e.type === 'uncalled') put -= e.amount;
  }
  if (put !== totalPot) fail('Pot passt nicht zu den Einsätzen');

  return {
    id: id!,
    tournamentId: tournamentId!,
    tournamentName: tournamentName!,
    level: Number(level),
    smallBlind: chips(sb!),
    bigBlind: chips(bb!),
    ante: ante === undefined ? 0 : chips(ante),
    playedAt: `${year}-${month}-${day} ${time}`,
    dateKey: `${year}-${month}-${day}`,
    tableSize: Number(table![2]),
    buttonSeat: Number(table![3]),
    seats,
    heroCards,
    events,
    board,
    totalPot: totalPot!,
    raw,
  };
}

/** Parses every hand of a text; unreadable hands are skipped with a reason, the rest goes on. */
export function parseHistory(text: string): ParseResult {
  const { hands: parts, rest } = splitHands(text);
  const hands: ParsedHand[] = [];
  const skipped: SkippedHand[] = [];
  if (rest) skipped.push({ id: null, reason: 'Format nicht erkannt' });
  for (const part of parts) {
    try {
      hands.push(parseHand(part));
    } catch (error) {
      if (!(error instanceof HandParseError)) throw error;
      skipped.push({ id: HAND_ID.exec(part)?.[1] ?? null, reason: error.message });
    }
  }
  return { hands, skipped };
}
