import { type PreflopCell, preflopActionWord } from '../../engine/preflop/grading';
import { type PreflopKind, type StackDepth, aggressiveActionOf } from '../../engine/preflop/spots';
import type { ChartCell } from '../../engine/pushfold';

export const CELL_CLASS: Record<ChartCell, string> = {
  aggressive: 'cell--aggressive',
  fold: 'cell--fold',
  'close-aggressive': 'cell--close-aggressive',
  'close-fold': 'cell--close-fold',
};

export const PUSHFOLD_LEGEND: readonly ChartCell[] = ['aggressive', 'close-aggressive', 'close-fold', 'fold'];

export function cellText(cell: ChartCell, word: 'Push' | 'Call'): string {
  switch (cell) {
    case 'aggressive':
      return word;
    case 'fold':
      return 'Fold';
    case 'close-aggressive':
      return `knapp ${word}`;
    case 'close-fold':
      return 'knapp Fold';
  }
}

/** Four colours for starthand charts: aggressive, call, borderline, fold. */
export const PREFLOP_CELL_CLASS: Record<PreflopCell, string> = {
  aggressive: 'cell--aggressive',
  call: 'cell--call',
  close: 'cell--borderline',
  fold: 'cell--fold',
};

export function preflopCellText(cell: PreflopCell, kind: PreflopKind, stack: StackDepth): string {
  switch (cell) {
    case 'aggressive':
      return preflopActionWord(aggressiveActionOf(kind), stack);
    case 'call':
      return 'Call';
    case 'close':
      return 'Grenzfall';
    case 'fold':
      return 'Fold';
  }
}

/** Open-raise charts have no calls, so their legend leaves the call colour out. */
export const preflopLegend = (kind: PreflopKind): readonly PreflopCell[] =>
  kind === 'rfi' ? ['aggressive', 'close', 'fold'] : ['aggressive', 'call', 'close', 'fold'];
