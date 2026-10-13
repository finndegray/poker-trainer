import { POSITION_LABELS } from '../engine/positions';
import { preflopActionWord } from '../engine/preflop/grading';
import { type PreflopAction, type PreflopSpot, betsFor } from '../engine/preflop/spots';
import type { Action, Verdict } from '../engine/pushfold';
import type { SpotKind } from '../engine/spot-generator';
import type { XpResult } from '../game/xp';
import type { ActionType as ReviewActionType, Street as ReviewStreet } from '../review/parse';

const evNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = '−';

export function formatEv(ev: number): string {
  if (Math.abs(ev) < 0.005) return '0 BB';
  return `${ev > 0 ? '+' : MINUS}${evNumber.format(Math.abs(ev))} BB`;
}

const countNumber = new Intl.NumberFormat('de-DE');
/** Whole numbers with the German thousands separator, e.g. 1.240. */
export const formatCount = (n: number): string => countNumber.format(n);

/** "1 Hand" / "2 Hände". */
export const formatHands = (n: number): string => `${formatCount(n)} ${n === 1 ? 'Hand' : 'Hände'}`;

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

export function preflopSpotTitle(spot: PreflopSpot): string {
  const hero = POSITION_LABELS[spot.hero];
  if (spot.kind === 'rfi' || spot.villain === null) return `Open-Raise aus ${hero}`;
  const villain = POSITION_LABELS[spot.villain];
  return spot.kind === 'vsOpen' ? `${hero} gegen Open-Raise aus ${villain}` : `${hero} gegen 3-Bet aus ${villain}`;
}

const multiplierNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function xpSummary(xp: XpResult): string {
  const parts = [xp.xp > 0 ? `+${xp.xp} XP` : '0 XP'];
  if (xp.multiplier > 1) parts.push(`Combo ×${multiplierNumber.format(xp.multiplier)}`);
  if (xp.combo >= 2) parts.push(`${xp.combo} in Folge`);
  return parts.join(' · ');
}

const per100Number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
/** "Fehler pro 100 Hände", e.g. 3,2; a dash without hands. */
export const formatPer100 = (value: number | null): string => (value === null ? '–' : per100Number.format(value));

/** Chips as BB with the decimal comma, e.g. 1.650 chips at BB 300 → "5,5". */
export const formatChipsBb = (chips: number, bigBlind: number): string => formatBb(chips / bigBlind);

/** "2026-10-13" → "13.10.2026". */
export const formatDateKey = (key: string): string => `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;

/** "2026-10-13 15:46:28" → "13.10.2026 15:46". */
export const formatPlayedAt = (playedAt: string): string => `${formatDateKey(playedAt.slice(0, 10))} ${playedAt.slice(11, 16)}`;

export type ReviewActionInput = { action: ReviewActionType; amount: number; to: number | null; allIn: boolean };

const STREET_LABELS: Record<ReviewStreet, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
export const streetLabel = (street: ReviewStreet): string => STREET_LABELS[street];

/** A hand-history action in German: "Fold", "Check", "Call 1,5 BB", "Bet 3 BB", "Raise auf 6 BB", with " · All-in". */
export function reviewActionLabel(a: ReviewActionInput, bigBlind: number): string {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  const text =
    a.action === 'fold'
      ? 'Fold'
      : a.action === 'check'
        ? 'Check'
        : a.action === 'call'
          ? `Call ${bb(a.amount)}`
          : a.action === 'bet'
            ? `Bet ${bb(a.amount)}`
            : `Raise auf ${bb(a.to ?? a.amount)}`;
  return a.allIn && a.action !== 'fold' && a.action !== 'check' ? `${text} · All-in` : text;
}

/** Spec 10: where a retraining spot comes from, "2026-10-12 15:46:28" → „Aus deinem Turnier vom 12.10.“. */
export const retrainingHint = (playedAt: string): string => `Aus deinem Turnier vom ${playedAt.slice(8, 10)}.${playedAt.slice(5, 7)}.`;

/** „1 Spot aus deinen Turnieren wartet im Training.“ / „3 Spots … warten …“. */
export const formatRetrainingCount = (n: number): string =>
  n === 1 ? '1 Spot aus deinen Turnieren wartet im Training.' : `${formatCount(n)} Spots aus deinen Turnieren warten im Training.`;
