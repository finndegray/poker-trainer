import { formatPercent } from '../../app/format';
import type { WeekPoint } from '../../game/stats';

const WIDTH = 320;
const HEIGHT = 150;
const CHART_TOP = 20;
const CHART_BOTTOM = 120;
const BAR = 26;

export const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

/** One bar: `value` between 0 and 1 (null draws no bar), `text` above it, `label` below. */
export type TrendBar = { key: string; label: string; value: number | null; text: string };

export function TrendBars({ bars, ariaLabel }: { bars: readonly TrendBar[]; ariaLabel: string }) {
  const slot = WIDTH / bars.length;
  return (
    <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      <line x1="0" y1={CHART_BOTTOM} x2={WIDTH} y2={CHART_BOTTOM} className="trend-chart__axis" />
      {bars.map((bar, i) => {
        const x = i * slot + (slot - BAR) / 2;
        const height = bar.value === null ? 0 : bar.value * (CHART_BOTTOM - CHART_TOP);
        return (
          <g key={bar.key}>
            {bar.value !== null && <rect x={x} y={CHART_BOTTOM - height} width={BAR} height={height} rx="3" className="trend-chart__bar" />}
            <text x={x + BAR / 2} y={CHART_BOTTOM - height - 5} textAnchor="middle" className="trend-chart__value">
              {bar.text}
            </text>
            <text x={x + BAR / 2} y={HEIGHT - 12} textAnchor="middle" className="trend-chart__label">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrendChart({ points }: { points: readonly WeekPoint[] }) {
  const bars = points.map((p) => ({
    key: p.weekStart,
    label: shortDate(p.weekStart),
    value: p.accuracy.rate,
    text: formatPercent(p.accuracy.rate),
  }));
  return <TrendBars bars={bars} ariaLabel="Trefferquote der letzten 8 Wochen" />;
}
