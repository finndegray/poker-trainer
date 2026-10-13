import { HAND_COUNT } from '../engine/cards';
import type { Action, Spot, Verdict } from '../engine/pushfold';
import { type CategoryKey, type SpotKind, type StackBucket, categoryKey, stackBucketOf } from '../engine/spot-generator';
import type { Position } from '../engine/positions';
import { type DateKey, shiftDateKey } from './streak';

export type DecisionMode = 'training' | 'daily' | 'run';
export type DecisionRecord = {
  ts: number;
  dateKey: DateKey;
  mode: DecisionMode;
  spot: Spot;
  chosen: Action;
  verdict: Verdict;
  responseMs: number;
};

export type Accuracy = { correct: number; total: number; rate: number | null };
export type WeekPoint = { weekStart: DateKey; weekEnd: DateKey; accuracy: Accuracy };

export const ADAPTIVE_WINDOW = 50;
export const ADAPTIVE_BOOST = 4;
const DEFAULT_WEEKS = 8;

const isCorrect = (r: DecisionRecord): boolean => r.verdict !== 'wrong';

export function accuracy(records: readonly DecisionRecord[]): Accuracy {
  let correct = 0;
  for (const r of records) if (isCorrect(r)) correct++;
  return { correct, total: records.length, rate: records.length > 0 ? correct / records.length : null };
}

function groupBy<K, T>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function accuracyBy<K extends string>(
  records: readonly DecisionRecord[],
  keyOf: (r: DecisionRecord) => K,
): Map<K, Accuracy> {
  return new Map([...groupBy(records, keyOf)].map(([key, list]) => [key, accuracy(list)]));
}

export const byPosition = (r: DecisionRecord): Position => r.spot.position;
export const byStackBucket = (r: DecisionRecord): StackBucket => stackBucketOf(r.spot.stack);
export const byKind = (r: DecisionRecord): SpotKind => r.spot.kind;

export function handErrorMatrix(records: readonly DecisionRecord[], kind: SpotKind): { total: number[]; errors: number[] } {
  const total = new Array<number>(HAND_COUNT).fill(0);
  const errors = new Array<number>(HAND_COUNT).fill(0);
  for (const r of records) {
    if (r.spot.kind !== kind) continue;
    total[r.spot.hand]++;
    if (!isCorrect(r)) errors[r.spot.hand]++;
  }
  return { total, errors };
}

export function weeklyTrend(records: readonly DecisionRecord[], todayKey: DateKey, weeks = DEFAULT_WEEKS): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = shiftDateKey(todayKey, -7 * i);
    const weekStart = shiftDateKey(weekEnd, -6);
    // DateKeys in YYYY-MM-DD format compare correctly as strings.
    const inWeek = records.filter((r) => r.dateKey >= weekStart && r.dateKey <= weekEnd);
    out.push({ weekStart, weekEnd, accuracy: accuracy(inWeek) });
  }
  return out;
}

export function adaptiveWeights(records: readonly DecisionRecord[]): Map<CategoryKey, number> {
  const sorted = [...records].sort((a, b) => a.ts - b.ts);
  const weights = new Map<CategoryKey, number>();
  for (const [key, list] of groupBy(sorted, (r) => categoryKey(r.spot))) {
    const window = list.slice(-ADAPTIVE_WINDOW);
    const errorRate = window.filter((r) => !isCorrect(r)).length / window.length;
    weights.set(key, 1 + ADAPTIVE_BOOST * errorRate);
  }
  return weights;
}
