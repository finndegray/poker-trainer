import { POSITIONS, type Position, seatOf } from '../engine/positions';

/**
 * Builds a constructed GGPoker hand for tests. Players are named after their position ("UTG", "CO", …),
 * the hero is "Hero". Seats follow the position order (UTG = seat 1 … BB = seat 8), the button is the BTN seat.
 * Stacks are playable chips in BB (the ante comes on top). Only the lines after the hole cards are written by
 * the test; the posts, the pot total and the summary are generated.
 */
export type TestHandOptions = {
  id?: string;
  tournamentId?: string;
  tournamentName?: string;
  bigBlind?: number;
  ante?: number;
  tableSize?: number;
  hero: Position;
  heroCards?: string | null;
  players?: readonly Position[];
  stacksBb?: Partial<Record<Position, number>>;
  lines: readonly string[];
  playedAt?: string;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const chips = (text: string) => Number(text.replace(/,/g, ''));

export function ggHand(o: TestHandOptions): string {
  const bb = o.bigBlind ?? 100;
  const sb = bb / 2;
  const ante = o.ante ?? 10;
  const players = o.players ?? POSITIONS;
  const name = (p: Position) => (p === o.hero ? 'Hero' : p);
  const committed = new Map<string, number>([[name('SB'), sb], [name('BB'), bb]]);
  let total = ante * players.length + sb + bb;
  for (const line of o.lines) {
    if (line.startsWith('*** ')) committed.clear();
    const call = /^(\S+): (?:calls|bets) ([\d,]+)/.exec(line);
    const raise = /^(\S+): raises [\d,]+ to ([\d,]+)/.exec(line);
    const uncalled = /^Uncalled bet \(([\d,]+)\) returned to (\S+)$/.exec(line);
    if (call) {
      total += chips(call[2]);
      committed.set(call[1], (committed.get(call[1]) ?? 0) + chips(call[2]));
    } else if (raise) {
      total += chips(raise[2]) - (committed.get(raise[1]) ?? 0);
      committed.set(raise[1], chips(raise[2]));
    } else if (uncalled) total -= chips(uncalled[1]);
  }
  const [date, time] = (o.playedAt ?? '2026/10/13 12:00:00').split(' ');
  return [
    `Poker Hand #${o.id ?? 'TM1'}: Tournament #${o.tournamentId ?? '1'}, ${o.tournamentName ?? 'Daily Classic $1'} Hold'em No Limit - Level1(${fmt(sb)}/${fmt(bb)}(${fmt(ante)})) - ${date} ${time}`,
    `Table '1' ${o.tableSize ?? 8}-max Seat #${seatOf('BTN') + 1} is the button`,
    ...players.map((p) => `Seat ${seatOf(p) + 1}: ${name(p)} (${fmt((o.stacksBb?.[p] ?? 100) * bb + ante)} in chips)`),
    ...players.map((p) => `${name(p)}: posts the ante ${fmt(ante)}`),
    `${name('SB')}: posts small blind ${fmt(sb)}`,
    `${name('BB')}: posts big blind ${fmt(bb)}`,
    '*** HOLE CARDS ***',
    ...players.map((p) => (p === o.hero && o.heroCards !== null ? `Dealt to Hero [${o.heroCards ?? 'Ah Kd'}]` : `Dealt to ${name(p)} `)),
    ...o.lines,
    '*** SHOWDOWN ***',
    '*** SUMMARY ***',
    `Total pot ${fmt(total)} | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0`,
  ].join('\n');
}

/** "UTG: folds" for each position from `from` up to (not including) `to`. */
export function foldsBetween(from: Position, to: Position, hero?: Position): string[] {
  return POSITIONS.slice(seatOf(from), seatOf(to)).map((p) => `${p === hero ? 'Hero' : p}: folds`);
}
