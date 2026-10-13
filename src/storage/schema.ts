import { HAND_COUNT } from '../engine/cards';
import { OPEN_POSITIONS, type Position, callerPositions } from '../engine/positions';
import { MAX_STACK, MIN_STACK } from '../engine/pushfold-data';
import { DAILY_SPOT_COUNT, type DailyResult } from '../game/daily';
import type { RunState } from '../game/endphase-run';
import type { DecisionRecord } from '../game/stats';

export const SCHEMA_VERSION = 1;
export const MAX_DECISIONS = 5000;
export const MAX_RUNS = 100;

export type RunSummary = {
  ts: number;
  dateKey: string;
  placement: number;
  finalTable: boolean;
  levelsCompleted: number;
  bonusXp: number;
};
export type Profile = { xp: number; combo: number; soundOn: boolean };
/** An unfinished daily challenge: `index` is the next spot to play (= spots answered so far). */
export type DailyProgress = { dateKey: string; index: number; correct: number; elapsedMs: number };
export type SaveState = {
  schemaVersion: 1;
  profile: Profile;
  days: Record<string, number>;
  decisions: DecisionRecord[];
  daily: Record<string, DailyResult>;
  runs: RunSummary[];
  bestRun: RunSummary | null;
  activeRun: RunState | null;
  /** Added after the first release; saves without the key load as `null`. */
  dailyProgress: DailyProgress | null;
};

export type SaveFormatErrorCode = 'corrupt' | 'newer-version';

export class SaveFormatError extends Error {
  readonly code: SaveFormatErrorCode;

  constructor(message: string, code: SaveFormatErrorCode) {
    super(message);
    this.code = code;
    this.name = 'SaveFormatError';
  }
}

export function emptyState(): SaveState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: 0, combo: 0, soundOn: true },
    days: {},
    decisions: [],
    daily: {},
    runs: [],
    bestRun: null,
    activeRun: null,
    dailyProgress: null,
  };
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNumber(v) && v >= 0;
const isString = (v: unknown): v is string => typeof v === 'string';
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => list.includes(v as T);

const MODES = ['training', 'daily', 'run'];
const VERDICTS = ['correct', 'close', 'wrong'];
const ACTIONS = ['shove', 'call', 'fold'];
const RUN_STATUSES = ['running', 'busted', 'finalTable'];
const RUN_MAX_LEVEL_INDEX = 7;
const RUN_MAX_SPOT_IN_LEVEL = 5;
const RUN_MAX_LIVES = 3;

function isSpot(v: unknown): boolean {
  if (!isObject(v) || !isIntIn(v.stack, MIN_STACK, MAX_STACK) || !isIntIn(v.hand, 0, HAND_COUNT - 1)) return false;
  if (v.kind === 'open') return isOneOf(v.position, OPEN_POSITIONS);
  if (v.kind === 'call') {
    return isOneOf(v.shover, OPEN_POSITIONS) && isOneOf<Position>(v.position, callerPositions(v.shover));
  }
  return false;
}

function isDecision(v: unknown): boolean {
  return isObject(v) && isNumber(v.ts) && isString(v.dateKey) && MODES.includes(v.mode as string)
    && isSpot(v.spot) && ACTIONS.includes(v.chosen as string) && VERDICTS.includes(v.verdict as string)
    && isCount(v.responseMs);
}

function isDaily(v: unknown): boolean {
  return isObject(v) && isString(v.dateKey) && isCount(v.correct) && isCount(v.total) && isCount(v.durationMs);
}

function isRun(v: unknown): boolean {
  return isObject(v) && isNumber(v.ts) && isString(v.dateKey) && isCount(v.placement)
    && typeof v.finalTable === 'boolean' && isCount(v.levelsCompleted) && isCount(v.bonusXp);
}

function isActiveRun(v: unknown): boolean {
  return isObject(v) && isIntIn(v.levelIndex, 0, RUN_MAX_LEVEL_INDEX) && isIntIn(v.spotInLevel, 0, RUN_MAX_SPOT_IN_LEVEL)
    && isIntIn(v.lives, 0, RUN_MAX_LIVES) && RUN_STATUSES.includes(v.status as string)
    && isIntIn(v.answered, 0, Number.MAX_SAFE_INTEGER);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (v: unknown): v is number => isIntIn(v, 0, Number.MAX_SAFE_INTEGER);

function isDailyProgress(v: unknown): boolean {
  return isObject(v) && isString(v.dateKey) && DATE_KEY.test(v.dateKey) && isIntIn(v.index, 0, DAILY_SPOT_COUNT - 1)
    && isInt(v.correct) && (v.correct as number) <= (v.index as number) && isInt(v.elapsedMs);
}

function fail(reason: string, code: SaveFormatErrorCode = 'corrupt'): never {
  throw new SaveFormatError(`Spielstand nicht lesbar: ${reason}`, code);
}

export function migrate(raw: unknown): SaveState {
  if (!isObject(raw)) fail('kein gültiges Objekt');
  const version = raw.schemaVersion;
  if (!isNumber(version)) fail('Schema-Version fehlt');
  if (version > SCHEMA_VERSION) fail(`Version ${version} ist neuer als diese App`, 'newer-version');
  // Future versions: convert older schemas step by step here before validating.
  if (version !== SCHEMA_VERSION) fail(`unbekannte Version ${version}`);

  const p = raw.profile;
  if (!isObject(p) || !isCount(p.xp) || !isCount(p.combo) || typeof p.soundOn !== 'boolean') fail('Profil ungültig');
  if (!isObject(raw.days) || !Object.values(raw.days).every(isCount)) fail('Tageszähler ungültig');
  if (!Array.isArray(raw.decisions) || !raw.decisions.every(isDecision)) fail('Entscheidungen ungültig');
  if (!isObject(raw.daily) || !Object.values(raw.daily).every(isDaily)) fail('Daily-Ergebnisse ungültig');
  if (!Array.isArray(raw.runs) || !raw.runs.every(isRun)) fail('Runs ungültig');
  if (raw.bestRun !== null && !isRun(raw.bestRun)) fail('Bester Run ungültig');
  if (raw.activeRun !== null && !isActiveRun(raw.activeRun)) fail('Laufender Run ungültig');
  // Additive field: saves written before it existed have no key at all.
  const progress = 'dailyProgress' in raw ? raw.dailyProgress : null;
  if (progress !== null && !isDailyProgress(progress)) fail('Daily-Fortschritt ungültig');

  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: p.xp, combo: p.combo, soundOn: p.soundOn },
    days: { ...(raw.days as Record<string, number>) },
    decisions: [...(raw.decisions as DecisionRecord[])],
    daily: { ...(raw.daily as Record<string, DailyResult>) },
    runs: [...(raw.runs as RunSummary[])],
    bestRun: raw.bestRun as RunSummary | null,
    activeRun: raw.activeRun === null ? null : { ...(raw.activeRun as RunState) },
    dailyProgress: progress === null ? null : { ...(progress as DailyProgress) },
  };
}

export const serialize = (state: SaveState): string => JSON.stringify(state);

export function deserialize(text: string): SaveState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('kein gültiges JSON');
  }
  return migrate(raw);
}
