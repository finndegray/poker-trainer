import type { WeekPoint } from '../../game/stats';

const WIDTH = 320;
const HEIGHT = 150;
const CHART_TOP = 20;
const CHART_BOTTOM = 120;
const BAR = 26;

const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

export function TrendChart({ points }: { points: readonly WeekPoint[] }) {
  const slot = WIDTH / points.length;
  return (
    <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Trefferquote der letzten 8 Wochen">
      <line x1="0" y1={CHART_BOTTOM} x2={WIDTH} y2={CHART_BOTTOM} className="trend-chart__axis" />
      {points.map((p, i) => {
        const x = i * slot + (slot - BAR) / 2;
        const rate = p.accuracy.rate;
        const height = rate === null ? 0 : rate * (CHART_BOTTOM - CHART_TOP);
        return (
          <g key={p.weekStart}>
            {rate !== null && (
              <rect x={x} y={CHART_BOTTOM - height} width={BAR} height={height} rx="3" className="trend-chart__bar" />
            )}
            <text x={x + BAR / 2} y={CHART_BOTTOM - height - 5} textAnchor="middle" className="trend-chart__value">
              {rate === null ? '–' : `${Math.round(rate * 100)}`}
            </text>
            <text x={x + BAR / 2} y={HEIGHT - 12} textAnchor="middle" className="trend-chart__label">
              {shortDate(p.weekStart)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
