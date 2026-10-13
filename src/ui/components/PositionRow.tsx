import { POSITION_LABELS, type Position } from '../../engine/positions';

export type PositionItem = { position: Position; cellClass: string; title: string; current: boolean };

export function PositionRow({ items, summary }: { items: readonly PositionItem[]; summary: string }) {
  return (
    <div className="position-row">
      <ol className="position-row__list">
        {items.map((item) => (
          <li
            key={item.position}
            className={`position-row__item ${item.cellClass}${item.current ? ' position-row__item--hero' : ''}`}
            title={item.title}
          >
            {POSITION_LABELS[item.position]}
          </li>
        ))}
      </ol>
      <p className="position-row__summary">{summary}</p>
    </div>
  );
}
