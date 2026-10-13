import type { DailyResult } from '../game/daily';
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
export type SaveState = {
  schemaVersion: 1;
  profile: Profile;
  days: Record<string, number>;
  decisions: DecisionRecord[];
  daily: Record<string, DailyResult>;
  runs: RunSummary[];
  bestRun: RunSummary | null;
};

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
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
  };
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNumber(v) && v >= 0;
const isString = (v: unknown): v is string => typeof v === 'string';

const MODES = ['training', 'daily', 'run'];
const VERDICTS = ['correct', 'close', 'wrong'];
const ACTIONS = ['shove', 'call', 'fold'];

function isSpot(v: unknown): boolean {
  return isObject(v) && (v.kind === 'open' || (v.kind === 'call' && isString(v.shover)))
    && isString(v.position) && isNumber(v.stack) && isNumber(v.hand);
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

function fail(reason: string): never {
  throw new SaveFormatError(`Spielstand nicht lesbar: ${reason}`);
}

export function migrate(raw: unknown): SaveState {
  if (!isObject(raw)) fail('kein gültiges Objekt');
  const version = raw.schemaVersion;
  if (!isNumber(version)) fail('Schema-Version fehlt');
  if (version > SCHEMA_VERSION) fail(`Version ${version} ist neuer als diese App`);
  // Future versions: convert older schemas step by step here before validating.
  if (version !== SCHEMA_VERSION) fail(`unbekannte Version ${version}`);

  const p = raw.profile;
  if (!isObject(p) || !isCount(p.xp) || !isCount(p.combo) || typeof p.soundOn !== 'boolean') fail('Profil ungültig');
  if (!isObject(raw.days) || !Object.values(raw.days).every(isCount)) fail('Tageszähler ungültig');
  if (!Array.isArray(raw.decisions) || !raw.decisions.every(isDecision)) fail('Entscheidungen ungültig');
  if (!isObject(raw.daily) || !Object.values(raw.daily).every(isDaily)) fail('Daily-Ergebnisse ungültig');
  if (!Array.isArray(raw.runs) || !raw.runs.every(isRun)) fail('Runs ungültig');
  if (raw.bestRun !== null && !isRun(raw.bestRun)) fail('Bester Run ungültig');

  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: p.xp, combo: p.combo, soundOn: p.soundOn },
    days: { ...(raw.days as Record<string, number>) },
    decisions: [...(raw.decisions as DecisionRecord[])],
    daily: { ...(raw.daily as Record<string, DailyResult>) },
    runs: [...(raw.runs as RunSummary[])],
    bestRun: raw.bestRun as RunSummary | null,
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
