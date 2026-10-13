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
