import { type Action, type Grade, type Spot, grade } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import { MAX_DECISIONS, MAX_RUNS, type RunSummary, type SaveState } from '../storage/schema';
import { type DailyResult, bestDaily, isBetterDaily } from './daily';
import { type RunState, completedLevels, runBonusXp, runPlacement } from './endphase-run';
import type { DecisionMode, DecisionRecord } from './stats';
import { incrementDay, localDateKey } from './streak';
import { type RankName, type XpResult, rankFor, xpForDecision } from './xp';

export type DecisionInput = { spot: Spot; chosen: Action; responseMs: number; mode: DecisionMode; now: Date };
export type RankChange = { before: RankName; after: RankName; rankUp: boolean };
export type DecisionOutcome = { state: SaveState; grade: Grade; xp: XpResult; record: DecisionRecord; rank: RankChange };

function rankChange(xpBefore: number, xpAfter: number): RankChange {
  const before = rankFor(xpBefore).name;
  const after = rankFor(xpAfter).name;
  return { before, after, rankUp: before !== after };
}

export function recordDecision(data: PushFoldData, state: SaveState, input: DecisionInput): DecisionOutcome {
  const g = grade(data, input.spot, input.chosen);
  const xp = xpForDecision(g.verdict, input.responseMs, state.profile.combo);
  const dateKey = localDateKey(input.now);
  const record: DecisionRecord = {
    ts: input.now.getTime(),
    dateKey,
    mode: input.mode,
    spot: input.spot,
    chosen: input.chosen,
    verdict: g.verdict,
    responseMs: input.responseMs,
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
  if (state.daily[result.dateKey]) return { state, accepted: false, isPersonalBest: false };
  const isPersonalBest = isBetterDaily(result, bestDaily(Object.values(state.daily)));
  return { state: { ...state, daily: { ...state.daily, [result.dateKey]: result } }, accepted: true, isPersonalBest };
}

export function recordRun(
  state: SaveState,
  run: RunState,
  now: Date,
): { state: SaveState; summary: RunSummary; rank: RankChange; isPersonalBest: boolean } {
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
    },
    summary,
    rank: rankChange(state.profile.xp, xpAfter),
    isPersonalBest,
  };
}

export function setSound(state: SaveState, soundOn: boolean): SaveState {
  return { ...state, profile: { ...state.profile, soundOn } };
}
