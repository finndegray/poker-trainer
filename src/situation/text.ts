import { type Card, cardName } from '../engine/cards';
import { seatOf } from '../engine/positions';
import { maxStreetBet } from '../review/hand-model';
import type { HandEvent } from '../review/parse';
import { SITUATION_TOURNAMENTS } from '../review/situation-tournaments';
import { ANTE_CHIPS, CHIPS_PER_BB, SMALL_BLIND_CHIPS, type Situation, playSituation } from './model';

const fmt = (chips: number): string => chips.toLocaleString('en-US');
const cardList = (cards: readonly Card[]): string => `[${cards.map(cardName).join(' ')}]`;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local time as the hand history prints it (and `ParsedHand.playedAt` stores it): "2026-10-14 18:05:09". */
export const playedAtOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/**
 * Spec 4: the situation as a GGPoker hand history that `parseHand` reads, at any point of the input. The pot total in
 * the summary is what was put in minus what went back, so the parser's pot check holds for partial hands, too.
 */
export function situationText(situation: Situation, playedAt: string): string {
  const state = playSituation(situation);
  const { setup } = state;
  const tournament = SITUATION_TOURNAMENTS[setup.kind];
  const [date, time] = playedAt.split(' ');
  const first = state.states[0];
  const lines = [
    `Poker Hand #${setup.handId}: Tournament #${tournament.id}, ${tournament.name} Hold'em No Limit - Level1(${fmt(SMALL_BLIND_CHIPS)}/${fmt(CHIPS_PER_BB)}(${fmt(ANTE_CHIPS)})) - ${date.replace(/-/g, '/')} ${time}`,
    `Table 'Situation' 8-max Seat #${seatOf('BTN') + 1} is the button`,
    ...first.players.map((p) => `Seat ${p.seat}: ${p.name} (${fmt(p.startChips)} in chips)`),
  ];
  const allIn = (e: { allIn: boolean }) => (e.allIn ? ' and is all-in' : '');
  const board: Card[] = [];
  let holeCards = false;
  let showdown = false;
  const dealt = () => {
    holeCards = true;
    lines.push('*** HOLE CARDS ***');
    for (const p of first.players) lines.push(p.isHero ? `Dealt to ${p.name} ${cardList(setup.heroCards)}` : `Dealt to ${p.name} `);
  };
  const line = (e: HandEvent, i: number): string => {
    switch (e.type) {
      case 'ante':
        return `${e.player}: posts the ante ${fmt(e.amount)}${allIn(e)}`;
      case 'smallBlind':
        return `${e.player}: posts small blind ${fmt(e.amount)}${allIn(e)}`;
      case 'bigBlind':
        return `${e.player}: posts big blind ${fmt(e.amount)}${allIn(e)}`;
      case 'action': {
        const verb =
          e.action === 'fold'
            ? 'folds'
            : e.action === 'check'
              ? 'checks'
              : e.action === 'call'
                ? `calls ${fmt(e.amount)}`
                : e.action === 'bet'
                  ? `bets ${fmt(e.amount)}`
                  : `raises ${fmt(e.to! - maxStreetBet(state.states[i]))} to ${fmt(e.to!)}`;
        return `${e.player}: ${verb}${allIn(e)}`;
      }
      case 'board': {
        const before = board.length > 0 ? `${cardList(board)} ` : '';
        board.push(...e.cards);
        return `*** ${e.street.toUpperCase()} *** ${before}${cardList(e.cards)}`;
      }
      case 'uncalled':
        return `Uncalled bet (${fmt(e.amount)}) returned to ${e.player}`;
      case 'show':
        return `${e.player}: shows ${cardList(e.cards)}`;
      case 'collect':
        return `${e.player} collected ${fmt(e.amount)} from pot`;
    }
  };
  state.events.forEach((e, i) => {
    const post = e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind';
    if (!post && !holeCards) dealt();
    if ((e.type === 'show' || e.type === 'collect') && !showdown) {
      showdown = true;
      lines.push('*** SHOWDOWN ***');
    }
    lines.push(line(e, i));
  });
  if (!holeCards) dealt();
  if (!showdown && state.phase.type === 'done' && state.phase.reason !== 'heroFolded') lines.push('*** SHOWDOWN ***');
  lines.push('*** SUMMARY ***', `Total pot ${fmt(state.table.pot)} | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0`);
  if (board.length > 0) lines.push(`Board ${cardList(board)}`);
  return lines.join('\n');
}
