import { type HandClass, handName } from '../../engine/cards';
import type { ChartCell } from '../../engine/pushfold';
import { CELL_CLASS, cellText } from './chart-cells';

const LEGEND: ChartCell[] = ['aggressive', 'close-aggressive', 'close-fold', 'fold'];

type Props = { cells: readonly ChartCell[]; heroHand: HandClass; word: 'Push' | 'Call' };

export function RangeChart({ cells, heroHand, word }: Props) {
  return (
    <figure className="range-chart">
      <div className="range-chart__grid">
        {cells.map((cell, hand) => {
          const isHero = hand === heroHand;
          return (
            <div
              key={hand}
              className={`range-chart__cell ${CELL_CLASS[cell]}${isHero ? ' range-chart__cell--hero' : ''}`}
              title={`${handName(hand)}: ${cellText(cell, word)}`}
              aria-current={isHero ? 'true' : undefined}
            >
              {handName(hand)}
            </div>
          );
        })}
      </div>
      <figcaption className="range-chart__legend">
        {LEGEND.map((cell) => (
          <span key={cell} className="range-chart__legend-item">
            <span className={`range-chart__swatch ${CELL_CLASS[cell]}`} aria-hidden="true" />
            {cellText(cell, word)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
