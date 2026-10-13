import type { Spot } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import { mulberry32, seedFromString } from '../engine/rng';
import { generateSpot } from '../engine/spot-generator';
import type { DateKey } from './streak';

export const DAILY_SPOT_COUNT = 20;

export type DailyResult = { dateKey: DateKey; correct: number; total: number; durationMs: number };

export function dailySpots(data: PushFoldData, dateKey: DateKey): Spot[] {
  const rng = mulberry32(seedFromString(`daily:${dateKey}`));
  return Array.from({ length: DAILY_SPOT_COUNT }, () => generateSpot(data, rng));
}

export function isBetterDaily(a: DailyResult, b: DailyResult | undefined): boolean {
  if (!b) return true;
  if (a.correct !== b.correct) return a.correct > b.correct;
  return a.durationMs < b.durationMs;
}

export function bestDaily(results: readonly DailyResult[]): DailyResult | undefined {
  let best: DailyResult | undefined;
  for (const r of results) if (isBetterDaily(r, best)) best = r;
  return best;
}
