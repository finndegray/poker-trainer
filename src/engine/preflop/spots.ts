import { HAND_COUNT, type HandClass } from '../cards';
import { POSITIONS, type Position, blindOf, seatOf } from '../positions';

export type PreflopKind = 'rfi' | 'vsOpen' | 'vs3bet';
export const PREFLOP_KINDS: readonly PreflopKind[] = ['rfi', 'vsOpen', 'vs3bet'];
export type StackDepth = 40 | 100;
export const STACK_DEPTHS: readonly StackDepth[] = [40, 100];
export type PreflopAction = 'raise' | 'threeBet' | 'fourBet' | 'call' | 'fold';
export type PreflopSituation = { kind: PreflopKind; stack: StackDepth; hero: Position; villain: Position | null };
export type PreflopSpot = PreflopSituation & { hand: HandClass };
export type ChartKey = string;

/** Sizes in BB (raise "to" totals); the situation analysis suggests the same sizes. */
export const OPEN_RAISE = 2.2;
export const SB_OPEN_RAISE = 3;
export const THREE_BET_IP = 3;
export const THREE_BET_BLINDS = 4;
export const FOUR_BET = 2.2;
const SB = seatOf('SB');
const BB = seatOf('BB');

const isBlind = (p: Position) => seatOf(p) >= SB;
const round1 = (x: number) => Math.round(x * 10) / 10;

export function aggressiveActionOf(kind: PreflopKind): PreflopAction {
  if (kind === 'rfi') return 'raise';
  return kind === 'vsOpen' ? 'threeBet' : 'fourBet';
}

export function allowedActions(kind: PreflopKind): readonly PreflopAction[] {
  return kind === 'rfi' ? ['raise', 'fold'] : [aggressiveActionOf(kind), 'call', 'fold'];
}

function invalid(s: PreflopSituation): never {
  throw new Error(`Ungültiger Starthand-Spot: ${s.kind} ${s.stack} BB, ${s.hero} gegen ${s.villain ?? '–'}`);
}

export const PREFLOP_KIND_LABELS: Record<PreflopKind, string> = {
  rfi: 'Open-Raise',
  vsOpen: 'Gegen Open-Raise',
  vs3bet: 'Gegen 3-Bet',
};

export const preflopCategoryKey = (s: PreflopSituation): string => `${s.kind}|${s.hero}|${s.stack}`;

export function chartKeyFor(s: PreflopSituation): ChartKey {
  if (!PREFLOP_KINDS.includes(s.kind) || !STACK_DEPTHS.includes(s.stack)) invalid(s);
  const hero = seatOf(s.hero);
  if (hero < 0) invalid(s);
  if (s.kind === 'rfi') {
    if (s.villain !== null || hero > SB) invalid(s);
    return `rfi:${s.stack}:${s.hero}`;
  }
  if (s.villain === null || s.villain === undefined) invalid(s);
  const villain = seatOf(s.villain);
  if (villain < 0) invalid(s);
  if (s.kind === 'vsOpen') {
    if (villain > SB || hero <= villain) invalid(s);
    const group = hero === SB ? 'sb' : hero === BB ? 'bb' : 'ip';
    return `vsOpen:${s.stack}:${s.villain}:${group}`;
  }
  if (hero > SB || villain <= hero) invalid(s);
  const group = isBlind(s.villain) ? 'blinds' : 'ip';
  return `vs3bet:${s.stack}:${s.hero}:${group}`;
}

export function isPreflopSpot(v: unknown): v is PreflopSpot {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as PreflopSpot;
  if (!Number.isInteger(s.hand) || s.hand < 0 || s.hand >= HAND_COUNT) return false;
  try {
    chartKeyFor(s);
    return true;
  } catch {
    return false;
  }
}

export function validSituations(): PreflopSituation[] {
  const out: PreflopSituation[] = [];
  for (const stack of STACK_DEPTHS) {
    for (let h = 0; h <= SB; h++) out.push({ kind: 'rfi', stack, hero: POSITIONS[h], villain: null });
    for (let v = 0; v <= SB; v++) {
      for (let h = v + 1; h <= BB; h++) out.push({ kind: 'vsOpen', stack, hero: POSITIONS[h], villain: POSITIONS[v] });
    }
    for (let h = 0; h <= SB; h++) {
      for (let v = h + 1; v <= BB; v++) out.push({ kind: 'vs3bet', stack, hero: POSITIONS[h], villain: POSITIONS[v] });
    }
  }
  return out;
}

export const preflopCategories = (): string[] => [...new Set(validSituations().map(preflopCategoryKey))].sort();

export function expectedChartKeys(stack: StackDepth): ChartKey[] {
  const keys = new Set(validSituations().filter((s) => s.stack === stack).map(chartKeyFor));
  return [...keys].sort();
}

const openSize = (opener: Position) => (opener === 'SB' ? SB_OPEN_RAISE : OPEN_RAISE);
const threeBetSize = (open: number, threeBettor: Position) =>
  round1(open * (isBlind(threeBettor) ? THREE_BET_BLINDS : THREE_BET_IP));

// All amounts in BB. facing/aggressiveTo are totals ("raise to"); stackBehind = stack - heroPosted (rounded to 0.1 against float noise).
export type PreflopBets = {
  heroPosted: number;
  villainPosted: number | null;
  facing: number | null;
  aggressiveTo: number;
  stackBehind: number;
};

export function betsFor(s: PreflopSituation): PreflopBets {
  chartKeyFor(s);
  const done = (heroPosted: number, villainPosted: number | null, aggressiveTo: number): PreflopBets => ({
    heroPosted,
    villainPosted,
    facing: villainPosted,
    aggressiveTo,
    stackBehind: round1(s.stack - heroPosted),
  });
  if (s.kind === 'rfi') return done(blindOf(seatOf(s.hero)), null, openSize(s.hero));
  if (s.kind === 'vsOpen') {
    const open = openSize(s.villain!);
    return done(blindOf(seatOf(s.hero)), open, threeBetSize(open, s.hero));
  }
  const heroOpen = openSize(s.hero);
  const threeBet = threeBetSize(heroOpen, s.villain!);
  return done(heroOpen, threeBet, s.stack === 40 ? 40 : round1(threeBet * FOUR_BET));
}

export function sizesFor(s: PreflopSituation): { facing: number | null; aggressiveTo: number } {
  const { facing, aggressiveTo } = betsFor(s);
  return { facing, aggressiveTo };
}
