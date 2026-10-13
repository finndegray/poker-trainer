import { type HandClass, handName } from '../../engine/cards';

type Props<C extends string> = {
  cells: readonly C[];
  heroHand: HandClass;
  legend: readonly C[];
  cellClass: (cell: C) => string;
  cellLabel: (cell: C) => string;
};

export function RangeChart<C extends string>({ cells, heroHand, legend, cellClass, cellLabel }: Props<C>) {
  return (
    <figure className="range-chart">
      <div className="range-chart__grid">
        {cells.map((cell, hand) => {
          const isHero = hand === heroHand;
          return (
            <div
              key={hand}
              className={`range-chart__cell ${cellClass(cell)}${isHero ? ' range-chart__cell--hero' : ''}`}
              title={`${handName(hand)}: ${cellLabel(cell)}`}
              aria-current={isHero ? 'true' : undefined}
            >
              {handName(hand)}
            </div>
          );
        })}
      </div>
      <figcaption className="range-chart__legend">
        {legend.map((cell) => (
          <span key={cell} className="range-chart__legend-item">
            <span className={`range-chart__swatch ${cellClass(cell)}`} aria-hidden="true" />
            {cellLabel(cell)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
