import { allCharts, continueRange } from '../src/engine/preflop/charts';
import { rangeWidth } from '../src/engine/preflop/ranges';

const percent = (x: number) => `${(x * 100).toFixed(1)} %`.padStart(7);

for (const [key, chart] of [...allCharts()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${key.padEnd(24)} aggressiv ${percent(rangeWidth(chart.aggressive))}  weiter ${percent(rangeWidth(continueRange(chart)))}  Grenzhände ${chart.close.size}`,
  );
}
