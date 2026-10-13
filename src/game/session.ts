import { type Action, type Grade, type Spot, type Verdict, grade } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { type GeneratorOptions, generateSpot } from '../engine/spot-generator';
import { MAX_DECISIONS, MAX_RUNS, type RunSummary, type SaveState } from '../storage/schema';
import { type DailyResult, bestDaily, isBetterDaily } from './daily';
import { type RunState, applyRunAnswer, completedLevels, runBonusXp, runPlacement, startRun } from './endphase-run';
import { type DecisionMode, type DecisionRecord, adaptiveWeights } from './stats';
import { currentStreak, dayProgress, incrementDay, localDateKey } from './streak';
import { type RankInfo, type RankName, SPEED_LIMIT_MS, type XpResult, rankFor, xpForDecision } from './xp';

export type DecisionInput = { spot: Spot; chosen: Action; responseMs: number; mode: DecisionMode; now: Date };
export type RankChange = { before: RankName; after: RankName; rankUp: boolean };
export type DecisionOutcome = { state: SaveState; grade: Grade; xp: XpResult; record: DecisionRecord; rank: RankChange };

function rankChange(xpBefore: number, xpAfter: number): RankChange {
  const before = rankFor(xpBefore).name;
  const after = rankFor(xpAfter).name;
  return { before, after, rankUp: before !== after };
}

function assertValidDate(now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new Error('Ungültiges Datum: Zeitpunkt ist keine gültige Zeit');
}

// Non-finite times (e.g. a broken timer) count as slow; negative times are clamped to 0.
const sanitizeResponseMs = (ms: number): number => (Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : SPEED_LIMIT_MS);

export function recordDecision(data: PushFoldData, state: SaveState, input: DecisionInput): DecisionOutcome {
  assertValidDate(input.now);
  const responseMs = sanitizeResponseMs(input.responseMs);
  const g = grade(data, input.spot, input.chosen);
  const xp = xpForDecision(g.verdict, responseMs, state.profile.combo);
  const dateKey = localDateKey(input.now);
  const record: DecisionRecord = {
    ts: input.now.getTime(),
    dateKey,
    mode: input.mode,
    spot: input.spot,
    chosen: input.chosen,
    verdict: g.verdict,
    responseMs,
  };
  const xpAfter = state.profile.xp + xp.xp;
  const next: SaveState = {
    ...state,
    profile: { ...state.profile, xp: xpAfter, combo: xp.combo },
    days: incrementDay(state.days, dateKey),
    decisions: [...state.decisions, record].slice(-MAX_DECISIONS),
  };
  return { state: next, grade: g, xp, record, rank: rankChange(state.profile.xp, xpAfter) };
}

export function recordDaily(
  state: SaveState,
  result: DailyResult,
): { state: SaveState; accepted: boolean; isPersonalBest: boolean } {
  const { correct, total, durationMs } = result;
  const valid = Number.isInteger(correct) && Number.isInteger(total) && Number.isInteger(durationMs)
    && correct >= 0 && correct <= total && durationMs >= 0;
  if (!valid) throw new Error(`Ungültiges Daily-Ergebnis: ${correct}/${total} in ${durationMs} ms`);
  if (state.daily[result.dateKey]) return { state, accepted: false, isPersonalBest: false };
  const isPersonalBest = isBetterDaily(result, bestDaily(Object.values(state.daily)));
  return { state: { ...state, daily: { ...state.daily, [result.dateKey]: result } }, accepted: true, isPersonalBest };
}

export function recordRun(
  state: SaveState,
  run: RunState,
  now: Date,
): { state: SaveState; summary: RunSummary; rank: RankChange; isPersonalBest: boolean } {
  assertValidDate(now);
  const placement = runPlacement(run);
  if (placement === null) throw new Error('Der Run läuft noch');
  const summary: RunSummary = {
    ts: now.getTime(),
    dateKey: localDateKey(now),
    placement,
    finalTable: run.status === 'finalTable',
    levelsCompleted: completedLevels(run),
    bonusXp: runBonusXp(run),
  };
  const isPersonalBest = state.bestRun === null || placement < state.bestRun.placement;
  const xpAfter = state.profile.xp + summary.bonusXp;
  return {
    state: {
      ...state,
      profile: { ...state.profile, xp: xpAfter },
      runs: [...state.runs, summary].slice(-MAX_RUNS),
      bestRun: isPersonalBest ? summary : state.bestRun,
      activeRun: null,
    },
    summary,
    rank: rankChange(state.profile.xp, xpAfter),
    isPersonalBest,
  };
}

export function setSound(state: SaveState, soundOn: boolean): SaveState {
  return { ...state, profile: { ...state.profile, soundOn } };
}

export function startActiveRun(state: SaveState): SaveState {
  // Replaces any unfinished run: starting anew abandons it.
  return { ...state, activeRun: startRun() };
}

export function answerActiveRun(state: SaveState, verdict: Verdict): SaveState {
  if (state.activeRun === null) throw new Error('Kein laufender Run vorhanden');
  return { ...state, activeRun: applyRunAnswer(state.activeRun, verdict) };
}

export type SessionStatus = {
  rank: RankInfo;
  streak: number;
  dayProgress: { count: number; target: number; done: boolean };
  dailyToday: DailyResult | null;
  bestRun: RunSummary | null;
  activeRun: RunState | null;
};

export function statusOf(state: SaveState, now: Date): SessionStatus {
  const todayKey = localDateKey(now);
  return {
    rank: rankFor(state.profile.xp),
    streak: currentStreak(state.days, todayKey),
    dayProgress: dayProgress(state.days, todayKey),
    dailyToday: state.daily[todayKey] ?? null,
    bestRun: state.bestRun,
    activeRun: state.activeRun,
  };
}

export function nextTrainingSpot(
  data: PushFoldData,
  state: SaveState,
  rng: Rng,
  options: Omit<GeneratorOptions, 'categoryWeights'> = {},
): Spot {
  return generateSpot(data, rng, { ...options, categoryWeights: adaptiveWeights(state.decisions) });
}
