import type { Spot, Verdict } from '../engine/pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { generateSpot } from '../engine/spot-generator';

export const RUN_FIELD = 2000;
export const RUN_LEVEL_STACKS = [20, 17, 14, 12, 10, 8, 6, 4] as const;
export const RUN_SPOTS_PER_LEVEL = 5;
export const RUN_LIVES = 3;

const LAST_PLACE_BEFORE_FINAL_TABLE = 10;
const FINAL_TABLE_PLACEMENT: Record<number, number> = { 3: 1, 2: 3, 1: 7 };
const XP_PER_LEVEL = 10;
const XP_FINAL_TABLE = 100;

export type RunStatus = 'running' | 'busted' | 'finalTable';
export type RunState = {
  levelIndex: number;
  spotInLevel: number;
  lives: number;
  status: RunStatus;
  answered: number;
};

export function startRun(): RunState {
  return { levelIndex: 0, spotInLevel: 0, lives: RUN_LIVES, status: 'running', answered: 0 };
}

function assertRunning(state: RunState): void {
  if (state.status !== 'running') throw new Error('Der Run ist bereits beendet');
}

export function runStack(state: RunState, rng: Rng): number {
  const base = RUN_LEVEL_STACKS[state.levelIndex];
  const varied = base + Math.floor(rng() * 3) - 1;
  return Math.min(MAX_STACK, Math.max(MIN_STACK, varied));
}

export function nextRunSpot(data: PushFoldData, state: RunState, rng: Rng): Spot {
  assertRunning(state);
  const stack = runStack(state, rng);
  return generateSpot(data, rng, { minStack: stack, maxStack: stack });
}

export function applyRunAnswer(state: RunState, verdict: Verdict): RunState {
  assertRunning(state);
  const lives = verdict === 'wrong' ? state.lives - 1 : state.lives;
  const answered = state.answered + 1;
  if (lives === 0) return { ...state, lives, answered, status: 'busted' };

  const spotInLevel = state.spotInLevel + 1;
  if (spotInLevel < RUN_SPOTS_PER_LEVEL) return { ...state, lives, answered, spotInLevel };
  if (state.levelIndex === RUN_LEVEL_STACKS.length - 1) {
    return { ...state, lives, answered, spotInLevel, status: 'finalTable' };
  }
  return { ...state, lives, answered, spotInLevel: 0, levelIndex: state.levelIndex + 1 };
}

export const completedLevels = (state: RunState): number =>
  state.status === 'finalTable' ? RUN_LEVEL_STACKS.length : state.levelIndex;

export function runPlacement(state: RunState): number | null {
  if (state.status === 'running') return null;
  if (state.status === 'finalTable') return FINAL_TABLE_PLACEMENT[state.lives];
  const level = state.levelIndex + 1;
  const step = (RUN_FIELD - LAST_PLACE_BEFORE_FINAL_TABLE) / (RUN_LEVEL_STACKS.length - 1);
  return Math.round(RUN_FIELD - (level - 1) * step);
}

export function runBonusXp(state: RunState): number {
  return completedLevels(state) * XP_PER_LEVEL + (state.status === 'finalTable' ? XP_FINAL_TABLE : 0);
}
