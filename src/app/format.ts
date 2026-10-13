import { POSITION_LABELS } from '../engine/positions';
import { preflopActionWord } from '../engine/preflop/grading';
import { type PreflopAction, type PreflopSpot, betsFor } from '../engine/preflop/spots';
import type { Action, Verdict } from '../engine/pushfold';
import type { SpotKind } from '../engine/spot-generator';

const evNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = '−';

export function formatEv(ev: number): string {
  if (Math.abs(ev) < 0.005) return '0 BB';
  return `${ev > 0 ? '+' : MINUS}${evNumber.format(Math.abs(ev))} BB`;
}

const countNumber = new Intl.NumberFormat('de-DE');
/** Whole numbers with the German thousands separator, e.g. 1.240. */
export const formatCount = (n: number): string => countNumber.format(n);

export function formatPercent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)} %`;
}

const ACTION_LABELS: Record<Action, string> = { shove: 'All-in', call: 'Call', fold: 'Fold' };
export const actionLabel = (action: Action): string => ACTION_LABELS[action];

export const aggressiveWord = (kind: SpotKind): 'Push' | 'Call' => (kind === 'open' ? 'Push' : 'Call');

export function evLine(kind: SpotKind, evAggressive: number): string {
  const label = kind === 'open' ? 'All-in' : 'Call';
  return `${label} ${formatEv(evAggressive)} · Fold 0 BB`;
}

const VERDICT_LABELS: Record<Verdict, string> = {
  correct: 'Richtig',
  close: 'Knapp – beides okay',
  wrong: 'Falsch',
};
export const verdictLabel = (verdict: Verdict): string => VERDICT_LABELS[verdict];

const bbNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
/** Chip amounts in BB with the German decimal comma, e.g. 6,6. */
export const formatBb = (bb: number): string => bbNumber.format(bb);

export function preflopChoiceLabel(action: PreflopAction, spot: PreflopSpot): string {
  if (action === 'fold') return 'Fold';
  if (action === 'call') return 'Call';
  const word = preflopActionWord(action, spot.stack);
  const to = formatBb(betsFor(spot).aggressiveTo);
  return word === 'All-in' ? `All-in ${to} BB` : `${word} auf ${to} BB`;
}

export function preflopSituationText(spot: PreflopSpot): string {
  const { facing } = betsFor(spot);
  if (spot.kind === 'rfi' || spot.villain === null || facing === null) return 'Alle folden zu dir';
  const villain = POSITION_LABELS[spot.villain];
  return spot.kind === 'vsOpen'
    ? `${villain} erhöht auf ${formatBb(facing)} BB`
    : `${villain} 3-bettet auf ${formatBb(facing)} BB`;
}
