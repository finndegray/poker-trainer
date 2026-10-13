import { HAND_COUNT } from '../engine/cards';
import type { PreflopAction, PreflopSpot } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import type { Action, Spot, Verdict } from '../engine/pushfold';
import { type CategoryKey, type SpotKind, type StackBucket, categoryKey, stackBucketOf } from '../engine/spot-generator';
import { type DateKey, shiftDateKey } from './streak';

export type DecisionMode = 'training' | 'daily' | 'run';
export type DecisionGame = 'pushfold' | 'preflop';
type RecordBase = { ts: number; dateKey: DateKey; mode: DecisionMode; verdict: Verdict; responseMs: number };
/** Saves written before the starthand training have no `game` key: missing means push/fold. */
export type PushFoldRecord = RecordBase & { game?: 'pushfold'; spot: Spot; chosen: Action };
export type PreflopRecord = RecordBase & { game: 'preflop'; spot: PreflopSpot; chosen: PreflopAction };
export type DecisionRecord = PushFoldRecord | PreflopRecord;

export type Accuracy = { correct: number; total: number; rate: number | null };
export type WeekPoint = { weekStart: DateKey; weekEnd: DateKey; accuracy: Accuracy };

export const ADAPTIVE_WINDOW = 50;
export const ADAPTIVE_BOOST = 4;
const DEFAULT_WEEKS = 8;

export const isPreflopRecord = (r: DecisionRecord): r is PreflopRecord => r.game === 'preflop';
export const pushFoldRecords = (records: readonly DecisionRecord[]): PushFoldRecord[] =>
  records.filter((r): r is PushFoldRecord => !isPreflopRecord(r));
export const preflopRecords = (records: readonly DecisionRecord[]): PreflopRecord[] => records.filter(isPreflopRecord);

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

export function accuracyBy<R extends DecisionRecord, K extends string>(
  records: readonly R[],
  keyOf: (r: R) => K,
): Map<K, Accuracy> {
  return new Map([...groupBy(records, keyOf)].map(([key, list]) => [key, accuracy(list)]));
}

export const byPosition = (r: PushFoldRecord): Position => r.spot.position;
export const byStackBucket = (r: PushFoldRecord): StackBucket => stackBucketOf(r.spot.stack);
export const byKind = (r: PushFoldRecord): SpotKind => r.spot.kind;

function errorMatrix(records: readonly DecisionRecord[]): { total: number[]; errors: number[] } {
  const total = new Array<number>(HAND_COUNT).fill(0);
  const errors = new Array<number>(HAND_COUNT).fill(0);
  for (const r of records) {
    total[r.spot.hand]++;
    if (!isCorrect(r)) errors[r.spot.hand]++;
  }
  return { total, errors };
}

/** Push/fold only: starthand records are skipped even for the same hand class. */
export function handErrorMatrix(records: readonly DecisionRecord[], kind: SpotKind): { total: number[]; errors: number[] } {
  return errorMatrix(pushFoldRecords(records).filter((r) => r.spot.kind === kind));
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

function weightsBy<R extends DecisionRecord>(records: readonly R[], keyOf: (r: R) => string): Map<string, number> {
  const sorted = [...records].sort((a, b) => a.ts - b.ts);
  const weights = new Map<string, number>();
  for (const [key, list] of groupBy(sorted, keyOf)) {
    const window = list.slice(-ADAPTIVE_WINDOW);
    const errorRate = window.filter((r) => !isCorrect(r)).length / window.length;
    weights.set(key, 1 + ADAPTIVE_BOOST * errorRate);
  }
  return weights;
}

/** Push/fold categories only, so starthand mistakes do not change the push/fold spot mix. */
export const adaptiveWeights = (records: readonly DecisionRecord[]): Map<CategoryKey, number> =>
  weightsBy(pushFoldRecords(records), (r) => categoryKey(r.spot));
