import type { ChartCell } from '../../engine/pushfold';

export const CELL_CLASS: Record<ChartCell, string> = {
  aggressive: 'cell--aggressive',
  fold: 'cell--fold',
  'close-aggressive': 'cell--close-aggressive',
  'close-fold': 'cell--close-fold',
};

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
