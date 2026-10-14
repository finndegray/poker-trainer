import { formatBb, formatChipsBb, reviewActionLabel, streetLabel } from '../app/format';
import { handClassOf, handName } from '../engine/cards';
import { POSITION_LABELS } from '../engine/positions';
import {
  CHIPS_PER_BB,
  CHIPS_PER_STEP,
  type LegalActions,
  type SituationSetup,
  type SituationState,
  type SituationStep,
} from '../situation/model';
import type { Choice } from './components/ActionBar';
import type { HeroDecision } from '../review/analysis';
import type { HandEvent } from '../review/parse';
import { POSTFLOP_VERDICT_LABELS } from '../review/postflop-text';
import { type DecisionOutcome, decisionOutcome } from '../review/summary';
import type { TournamentKind } from '../review/tournament-kind';
import { describeEvent } from './replay-model';

export type SituationChoice = 'empty' | 'fold' | 'check' | 'call' | 'size' | 'allIn';

const bb = (chips: number): string => `${formatChipsBb(chips, CHIPS_PER_BB)} BB`;

/** "25", "25,5" or "25.5" → 25.5; null for anything else (at most one decimal). */
export function parseBbInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d+(\.\d)?$/.test(normalized) ? Number(normalized) : null;
}

/**
 * The bet or raise (street total, chips) the size field asks for, clamped into the allowed range: below the minimum
 * becomes the minimum, above the stack the all-in. An empty or unreadable field uses the suggested size.
 */
export function sizeOf(legal: LegalActions, input: string): number | null {
  const range = legal.bet ?? legal.raise;
  if (!range) return null;
  const value = parseBbInput(input);
  const chips = value === null ? (legal.suggested ?? range.min) : Math.round(value * 10) * CHIPS_PER_STEP;
  return Math.min(range.max, Math.max(range.min, chips));
}

/**
 * Name of a raise at `index` (an event index, `events.length` for the action now), as in the training:
 * preflop the first raise is „Raise“ (open), then „3-Bet“, „4-Bet“ …; after the flop always „Raise“.
 */
export function raiseWordAt(events: readonly HandEvent[], index: number): string {
  let raises = 0;
  for (let i = 0; i < index && i < events.length; i++) {
    const event = events[i];
    if (event.type === 'board') return 'Raise';
    if (event.type === 'action' && event.action === 'raise') raises++;
  }
  return raises === 0 ? 'Raise' : `${raises + 2}-Bet`;
}

/** A hero decision of the summary, e.g. „3-Bet auf 6,6 BB“. */
export function situationActionLabel(decision: HeroDecision, events: readonly HandEvent[]): string {
  const label = reviewActionLabel(decision, CHIPS_PER_BB);
  return decision.action === 'raise' ? label.replace(/^Raise/, raiseWordAt(events, decision.eventIndex)) : label;
}

/** The verdict word of the summary: preflop as in the training, postflop „Passt“, „Fraglich“ or „Wahrscheinlich Fehler“. */
export function situationVerdictLabel(decision: HeroDecision, kind: TournamentKind, labels: Record<DecisionOutcome, string>): string {
  const outcome = decisionOutcome(decision, kind);
  const { rating } = decision;
  return rating.model === 'postflop' && outcome !== 'hint' ? POSTFLOP_VERDICT_LABELS[rating.verdict] : labels[outcome];
}

/** The buttons for the player to act, in the style of the training (keyboard shortcut first). */
export function situationChoices(legal: LegalActions, size: number | null, raiseWord = 'Raise'): Choice<SituationChoice>[] {
  const choices: Choice<SituationChoice>[] = [];
  if (legal.empty) choices.push({ action: 'empty', label: 'Platz leer', keys: ['l'] });
  if (legal.fold) choices.push({ action: 'fold', label: 'Fold', keys: ['f'] });
  if (legal.check) choices.push({ action: 'check', label: 'Check', keys: ['k', 'c'] });
  if (legal.call) choices.push({ action: 'call', label: `Call ${bb(legal.call.amount)}${legal.call.allIn ? ' · All-in' : ''}`, keys: ['c'] });
  const range = legal.bet ?? legal.raise;
  if (range && size !== null) {
    if (size < range.max) choices.push({ action: 'size', label: legal.bet ? `Bet ${bb(size)}` : `${raiseWord} auf ${bb(size)}`, keys: ['r', 'b'], primary: true });
    choices.push({ action: 'allIn', label: `All-in ${bb(range.max)}`, keys: ['a'], primary: size >= range.max });
  }
  return choices;
}

export function stepOf(choice: SituationChoice, legal: LegalActions, size: number | null): SituationStep {
  const type = legal.bet ? 'bet' : 'raise';
  const range = legal.bet ?? legal.raise;
  switch (choice) {
    case 'empty':
    case 'fold':
    case 'check':
    case 'call':
      return { type: choice };
    case 'size':
      return { type, to: size ?? range!.min };
    case 'allIn':
      return { type, to: range!.max };
  }
}

/** What the table shows in the middle: the last thing that happened. */
export function lastEventText(state: SituationState): string {
  const i = state.events.length - 1;
  const event = state.events[i];
  if (!event || event.type === 'ante' || event.type === 'smallBlind' || event.type === 'bigBlind') return 'Karten verteilt';
  return describeEvent(event, state.states[i], CHIPS_PER_BB);
}

/** What the input asks for next. */
export function promptText(state: SituationState): string {
  const { phase } = state;
  if (phase.type === 'act') return phase.legal.isHero ? 'Du bist dran' : `${POSITION_LABELS[phase.legal.position]} ist dran`;
  if (phase.type === 'board') {
    const what = phase.count === 3 ? 'drei Karten' : 'eine Karte';
    return `${streetLabel(phase.street)}: ${what} wählen${phase.optional ? ' (optional, alle sind all-in)' : ''}`;
  }
  if (phase.reason === 'heroFolded') return 'Du hast gefoldet – die Hand ist für dich vorbei';
  if (phase.reason === 'folded') {
    const winner = state.table.players.find((p) => !p.folded)!;
    return winner.isHero ? 'Alle anderen haben gefoldet – du gewinnst den Pot' : `${POSITION_LABELS[winner.position!]} gewinnt den Pot`;
  }
  return 'Showdown – die Hand ist zu Ende';
}

/** Spec 3: the suggested name, e.g. „AKo UTG · 25 BB“. */
export const defaultSituationName = (setup: SituationSetup): string =>
  `${handName(handClassOf(setup.heroCards[0], setup.heroCards[1]))} ${POSITION_LABELS[setup.hero]} · ${formatBb(setup.stacks[setup.hero])} BB`;
