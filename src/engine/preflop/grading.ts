import { HAND_COUNT, handName } from '../cards';
import { POSITIONS, POSITION_LABELS, type Position, seatOf } from '../positions';
import type { Verdict } from '../pushfold';
import { type PreflopChart, chartFor, mainActionOf } from './charts';
import {
  type PreflopAction,
  type PreflopSituation,
  type PreflopSpot,
  type StackDepth,
  allowedActions,
  chartKeyFor,
} from './spots';

export type PreflopGrade = { verdict: Verdict; chosen: PreflopAction; best: PreflopAction; alternative: PreflopAction | null };
export type PreflopCell = 'aggressive' | 'call' | 'fold' | 'close';
export type PreflopPositionEntry = { position: Position; cell: PreflopCell; action: PreflopAction; isCurrent: boolean };
export type PreflopComparison = { axis: 'hero' | 'opener'; entries: PreflopPositionEntry[]; summary: string };

function assertHand(hand: number): void {
  if (!Number.isInteger(hand) || hand < 0 || hand >= HAND_COUNT) throw new Error(`Ungültiger Hand-Index: ${hand}`);
}

export function gradePreflop(spot: PreflopSpot, chosen: PreflopAction): PreflopGrade {
  if (!allowedActions(spot.kind).includes(chosen)) throw new Error(`Aktion ${chosen} passt nicht zum Spot`);
  assertHand(spot.hand);
  const chart = chartFor(spot);
  const best = mainActionOf(chart, spot.hand);
  const alternative = chart.close.get(spot.hand) ?? null;
  const verdict: Verdict = chosen === best ? 'correct' : chosen === alternative ? 'close' : 'wrong';
  return { verdict, chosen, best, alternative };
}

function cellOf(chart: PreflopChart, hand: number): PreflopCell {
  if (chart.close.has(hand)) return 'close';
  const action = mainActionOf(chart, hand);
  return action === 'fold' ? 'fold' : action === 'call' ? 'call' : 'aggressive';
}

export const preflopCells = (chart: PreflopChart): PreflopCell[] =>
  Array.from({ length: HAND_COUNT }, (_, hand) => cellOf(chart, hand));

const WORDS: Record<PreflopAction, string> = { raise: 'Raise', threeBet: '3-Bet', fourBet: '4-Bet', call: 'Call', fold: 'Fold' };

export const preflopActionWord = (action: PreflopAction, stack: StackDepth): string =>
  action === 'fourBet' && stack === 40 ? 'All-in' : WORDS[action];

const range = (from: Position, to: Position): Position[] => POSITIONS.slice(seatOf(from), seatOf(to) + 1);

type Plan = { axis: 'hero' | 'opener'; positions: Position[]; situationAt: (p: Position) => PreflopSituation; context: string };

function comparisonPlan(spot: PreflopSpot): Plan {
  const { kind, stack } = spot;
  if (kind === 'rfi') {
    return {
      axis: 'hero',
      positions: range('UTG', 'SB'),
      situationAt: (hero) => ({ kind, stack, hero, villain: null }),
      context: 'Open-Raise',
    };
  }
  const group = chartKeyFor(spot).split(':')[3];
  if (kind === 'vsOpen') {
    const hero: Position = group === 'ip' ? 'BTN' : group === 'sb' ? 'SB' : 'BB';
    const lastOpener: Position = group === 'ip' ? 'CO' : group === 'sb' ? 'BTN' : 'SB';
    const label = group === 'ip' ? 'in Position' : group === 'sb' ? 'im SB' : 'im BB';
    return {
      axis: 'opener',
      positions: range('UTG', lastOpener),
      situationAt: (villain) => ({ kind, stack, hero, villain }),
      context: `gegen Open-Raise, du ${label}`,
    };
  }
  const blinds = group === 'blinds';
  return {
    axis: 'hero',
    positions: range('UTG', blinds ? 'SB' : 'CO'),
    situationAt: (hero) => ({ kind, stack, hero, villain: blinds ? 'BB' : 'BTN' }),
    context: blinds ? 'gegen 3-Bet aus den Blinds' : 'gegen 3-Bet in Position',
  };
}

function summarize(spot: PreflopSpot, plan: Plan, entries: readonly PreflopPositionEntry[]): string {
  const prep = plan.axis === 'hero' ? 'aus' : 'gegen';
  const word = (e: PreflopPositionEntry) => (e.cell === 'close' ? 'knapp' : preflopActionWord(e.action, spot.stack));
  const segments: Array<{ cell: PreflopCell; word: string; from: Position; to: Position }> = [];
  for (const e of entries) {
    const last = segments[segments.length - 1];
    if (last && last.cell === e.cell) last.to = e.position;
    else segments.push({ cell: e.cell, word: word(e), from: e.position, to: e.position });
  }
  const label = (p: Position) => POSITION_LABELS[p];
  const parts =
    segments.length === 1 && entries.length > 1
      ? [`${segments[0].word} ${plan.axis === 'hero' ? 'aus jeder Position' : 'gegen jede Position'}`]
      : segments.map((s, i) => {
          if (s.from === s.to) return `${s.word} ${prep} ${label(s.from)}`;
          if (i === segments.length - 1) return `${s.word} ab ${label(s.from)}`;
          return `${s.word} ${prep} ${label(s.from)} bis ${label(s.to)}`;
        });
  return `${handName(spot.hand)} (${spot.stack} BB, ${plan.context}): ${parts.join(', ')}`;
}

export function comparePreflopPositions(spot: PreflopSpot): PreflopComparison {
  assertHand(spot.hand);
  const plan = comparisonPlan(spot);
  const current = plan.axis === 'hero' ? spot.hero : spot.villain;
  const entries = plan.positions.map((position): PreflopPositionEntry => {
    const chart = chartFor(plan.situationAt(position));
    return {
      position,
      cell: cellOf(chart, spot.hand),
      action: mainActionOf(chart, spot.hand),
      isCurrent: position === current,
    };
  });
  return { axis: plan.axis, entries, summary: summarize(spot, plan, entries) };
}
