import { formatEv } from '../../app/format';
import type { PositionComparison } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import { CELL_CLASS, cellText } from './chart-cells';

export function PositionRow({ comparison, word }: { comparison: PositionComparison; word: 'Push' | 'Call' }) {
  return (
    <div className="position-row">
      <ol className="position-row__list">
        {comparison.entries.map((entry) => (
          <li
            key={entry.position}
            className={`position-row__item ${CELL_CLASS[entry.cell]}${entry.isHero ? ' position-row__item--hero' : ''}`}
            title={`${POSITION_LABELS[entry.position]}: ${cellText(entry.cell, word)} (${formatEv(entry.ev)})`}
          >
            {POSITION_LABELS[entry.position]}
          </li>
        ))}
      </ol>
      <p className="position-row__summary">{comparison.summary}</p>
    </div>
  );
}
