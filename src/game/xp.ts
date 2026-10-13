import type { Verdict } from '../engine/pushfold';

export const BASE_XP = 10;
export const SPEED_BONUS_XP = 5;
export const SPEED_LIMIT_MS = 5000;

export type XpResult = { xp: number; combo: number; multiplier: number };

export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1.5;
  return 1;
}

export function xpForDecision(verdict: Verdict, responseMs: number, comboBefore: number): XpResult {
  if (verdict === 'wrong') return { xp: 0, combo: 0, multiplier: 1 };
  const combo = comboBefore + 1;
  const multiplier = comboMultiplier(combo);
  const base = BASE_XP + (responseMs < SPEED_LIMIT_MS ? SPEED_BONUS_XP : 0);
  return { xp: Math.round(base * multiplier), combo, multiplier };
}

export const RANK_LADDER = [
  { name: 'Fish', minXp: 0 },
  { name: 'Donkey', minXp: 500 },
  { name: 'Grinder', minXp: 2000 },
  { name: 'Reg', minXp: 6000 },
  { name: 'Shark', minXp: 15000 },
  { name: 'Crusher', minXp: 40000 },
] as const;

export type RankName = (typeof RANK_LADDER)[number]['name'];
export type RankInfo = {
  name: RankName;
  minXp: number;
  next: { name: RankName; minXp: number } | null;
  progress: number;
};

export function rankFor(xp: number): RankInfo {
  if (!Number.isFinite(xp) || xp < 0) throw new Error(`Ungültige XP: ${xp}`);
  let index = 0;
  for (let k = 0; k < RANK_LADDER.length; k++) if (xp >= RANK_LADDER[k].minXp) index = k;
  const current = RANK_LADDER[index];
  const next = RANK_LADDER[index + 1];
  if (!next) return { name: current.name, minXp: current.minXp, next: null, progress: 1 };
  return {
    name: current.name,
    minXp: current.minXp,
    next: { name: next.name, minXp: next.minXp },
    progress: (xp - current.minXp) / (next.minXp - current.minXp),
  };
}
