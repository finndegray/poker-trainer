import { handName } from '../../engine/cards';

export function ErrorHeatmap({ total, errors }: { total: readonly number[]; errors: readonly number[] }) {
  return (
    <div className="heatmap">
      {total.map((n, hand) => {
        if (n === 0) {
          return (
            <div key={hand} className="heatmap__cell heat--none" title={`${handName(hand)}: noch nicht gespielt`}>
              {handName(hand)}
            </div>
          );
        }
        const percent = Math.round((errors[hand] / n) * 100);
        return (
          <div
            key={hand}
            className="heatmap__cell"
            title={`${handName(hand)}: ${errors[hand]} von ${n} falsch`}
            style={{ background: `color-mix(in srgb, var(--heat-high) ${percent}%, var(--heat-low))` }}
          >
            {handName(hand)}
          </div>
        );
      })}
    </div>
  );
}
