import { HAND_COUNT } from '../engine/cards';
import { OPEN_POSITIONS, type Position, callerPositions } from '../engine/positions';
import { MAX_STACK, MIN_STACK } from '../engine/pushfold-data';
import { DAILY_SPOT_COUNT, type DailyResult } from '../game/daily';
import type { RunState } from '../game/endphase-run';
import { type PreflopAction, type PreflopSpot, allowedActions, isPreflopSpot } from '../engine/preflop/spots';
import { type PreflopFilter, isPreflopFilter } from '../game/preflop-filter';
import {
  MAX_RETRAINING_DONE,
  MAX_RETRAINING_ENTRIES,
  MAX_RETRAINING_SYNCED,
  RETRAINING_CLEAR_STREAK,
  type RetrainingEntry,
  type RetrainingSpot,
  type RetrainingState,
  byPlayedAt,
  copyRetrainingSpot,
} from '../game/retraining';
import type { DecisionRecord, PreflopRecord, PushFoldRecord } from '../game/stats';

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
export type Profile = {
  xp: number;
  combo: number;
  soundOn: boolean;
  /** Added with the starthand training; missing means all spot types and stacks. */
  preflopFilter?: PreflopFilter;
};
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
  /** Added with the retraining (Plan 9): only written once a spot is queued or the switch is used. */
  retraining?: RetrainingState;
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

function hasDecisionBase(v: Obj): boolean {
  return isNumber(v.ts) && isString(v.dateKey) && MODES.includes(v.mode as string)
    && VERDICTS.includes(v.verdict as string) && isCount(v.responseMs);
}

const isPushFoldDecision = (v: Obj): boolean => hasDecisionBase(v) && isSpot(v.spot) && ACTIONS.includes(v.chosen as string);

const isPreflopDecision = (v: Obj): boolean =>
  hasDecisionBase(v) && isPreflopSpot(v.spot)
  && allowedActions((v.spot as PreflopSpot).kind).includes(v.chosen as PreflopAction);

/**
 * Push/fold records (no `game` key or 'pushfold') must be valid, as before the starthand training.
 * Starthand records and records of unknown games that fail validation are dropped, so they never block loading.
 */
function readDecisions(list: unknown): DecisionRecord[] {
  if (!Array.isArray(list)) fail('Entscheidungen ungültig');
  const out: DecisionRecord[] = [];
  for (const v of list) {
    if (!isObject(v)) fail('Entscheidungen ungültig');
    const game = 'game' in v ? v.game : 'pushfold';
    if (game === 'pushfold') {
      if (!isPushFoldDecision(v)) fail('Entscheidungen ungültig');
      out.push(v as PushFoldRecord);
    } else if (game === 'preflop' && isPreflopDecision(v)) {
      out.push(v as PreflopRecord);
    }
  }
  return out;
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

const PLAYED_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const MAX_ID_LENGTH = 200;
const isId = (v: unknown): v is string => isString(v) && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** A queued spot must be one the trainings can deal and grade. */
export const isRetrainingSpot = (r: RetrainingSpot): boolean =>
  r.game === 'pushfold' ? isSpot(r.spot) : r.game === 'preflop' && isPreflopSpot(r.spot);

function readRetrainingEntry(v: unknown): RetrainingEntry | null {
  if (!isObject(v) || !isId(v.key) || !isId(v.tournamentId) || !isString(v.playedAt) || !PLAYED_AT.test(v.playedAt)) return null;
  if (!isIntIn(v.streak, 0, RETRAINING_CLEAR_STREAK - 1)) return null;
  if ((v.game !== 'pushfold' && v.game !== 'preflop') || !isRetrainingSpot(v as RetrainingSpot)) return null;
  return { key: v.key, tournamentId: v.tournamentId, playedAt: v.playedAt, streak: v.streak, ...copyRetrainingSpot(v as RetrainingSpot) };
}

const idList = (v: unknown, max: number): string[] => [...new Set(Array.isArray(v) ? v.filter(isId) : [])].slice(-max);

/**
 * Additive field, never fatal: the queue is a copy of the archive's preflop errors. Invalid entries are dropped one by
 * one; if any was dropped, `synced` is cleared so the next start feeds the archive in again (done keys keep cleared
 * spots out). A broken field as a whole reads as missing and is rebuilt the same way.
 */
export function readRetraining(raw: unknown): RetrainingState | null {
  try {
    if (!isObject(raw)) return null;
    const list = Array.isArray(raw.entries) ? raw.entries : [];
    const entries: RetrainingEntry[] = [];
    const keys = new Set<string>();
    for (const v of list) {
      const entry = readRetrainingEntry(v);
      if (entry && !keys.has(entry.key)) {
        keys.add(entry.key);
        entries.push(entry);
      }
    }
    const intact = Array.isArray(raw.entries) && entries.length === list.length;
    return {
      ...(raw.off === true ? { off: true } : {}),
      entries: entries.sort(byPlayedAt).slice(-MAX_RETRAINING_ENTRIES),
      done: idList(raw.done, MAX_RETRAINING_DONE).filter((k) => !keys.has(k)),
      synced: intact ? idList(raw.synced, MAX_RETRAINING_SYNCED) : [],
    };
  } catch {
    return null;
  }
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
  // Additive field: a missing or invalid filter falls back to "all spots" instead of failing.
  const rawFilter = p.preflopFilter;
  const preflopFilter = isPreflopFilter(rawFilter) ? { kind: rawFilter.kind, stack: rawFilter.stack } : null;
  if (!isObject(raw.days) || !Object.values(raw.days).every(isCount)) fail('Tageszähler ungültig');
  const decisions = readDecisions(raw.decisions);
  if (!isObject(raw.daily) || !Object.values(raw.daily).every(isDaily)) fail('Daily-Ergebnisse ungültig');
  if (!Array.isArray(raw.runs) || !raw.runs.every(isRun)) fail('Runs ungültig');
  if (raw.bestRun !== null && !isRun(raw.bestRun)) fail('Bester Run ungültig');
  if (raw.activeRun !== null && !isActiveRun(raw.activeRun)) fail('Laufender Run ungültig');
  // Additive field: saves written before it existed have no key at all.
  const progress = 'dailyProgress' in raw ? raw.dailyProgress : null;
  if (progress !== null && !isDailyProgress(progress)) fail('Daily-Fortschritt ungültig');
  // Additive field (Plan 9): missing in all older saves; unreadable parts are dropped, never fatal.
  const retraining = 'retraining' in raw ? readRetraining(raw.retraining) : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: p.xp, combo: p.combo, soundOn: p.soundOn, ...(preflopFilter ? { preflopFilter } : {}) },
    days: { ...(raw.days as Record<string, number>) },
    decisions,
    daily: { ...(raw.daily as Record<string, DailyResult>) },
    runs: [...(raw.runs as RunSummary[])],
    bestRun: raw.bestRun as RunSummary | null,
    activeRun: raw.activeRun === null ? null : { ...(raw.activeRun as RunState) },
    dailyProgress: progress === null ? null : { ...(progress as DailyProgress) },
    ...(retraining ? { retraining } : {}),
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
