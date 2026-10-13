import { chartFor } from '../engine/preflop/charts';
import type { PreflopSituation, StackDepth } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import { playableChips } from './hand-model';
import { type ActionEvent, HERO, type ParsedHand } from './parse';
import { modelFor } from './preflop';

/** How the villain got to the flop (spec 7, step 1). */
export type VillainRole = 'opener' | 'caller' | 'bbDefender' | 'threeBettor' | 'callerVs3bet';

export type VillainStart = {
  villain: string;
  position: Position;
  role: VillainRole;
  /** The chart the start range comes from and which part of it. */
  chartKey: string;
  part: 'aggressive' | 'call';
  depth: StackDepth;
  approximation: boolean;
  effectiveBb: number;
  /** Hand classes of the start range (169 flags). */
  flags: boolean[];
};

export type RangeProblem = 'multiwayPostflop' | 'unknownRange' | 'limpRange' | 'deepRange' | 'shortRange';

const isRaise = (e: ActionEvent) => e.action === 'raise' || e.action === 'bet';

/**
 * The villain's start range from his preflop role, or why there is none. Exactly two players must see the flop and
 * the pot must come from a chart spot: open + call, open + BB defence, 3-bet + call. Stack depth as in spec 6.
 */
export function villainStart(hand: ParsedHand, positions: ReadonlyMap<string, Position>): VillainStart | RangeProblem {
  const flop = hand.events.findIndex((e) => e.type === 'board');
  const preflop = hand.events.slice(0, flop < 0 ? hand.events.length : flop).filter((e): e is ActionEvent => e.type === 'action');
  const folded = new Set(preflop.filter((e) => e.action === 'fold').map((e) => e.player));
  const inPot = hand.seats.map((s) => s.name).filter((n) => !folded.has(n));
  if (inPot.length !== 2 || !inPot.includes(HERO)) return 'multiwayPostflop';
  const villain = inPot.find((n) => n !== HERO)!;
  const heroPos = positions.get(HERO);
  const villainPos = positions.get(villain);
  if (!heroPos || !villainPos) return 'unknownRange';

  const raises = preflop.filter(isRaise);
  const firstRaise = preflop.findIndex(isRaise);
  if (firstRaise < 0 || preflop.slice(0, firstRaise).some((e) => e.action === 'call')) return 'limpRange';
  if (raises.length > 2) return 'deepRange';

  const effectiveBb = Math.min(playableChips(hand, HERO), playableChips(hand, villain)) / hand.bigBlind;
  const model = modelFor(effectiveBb);
  if (model.model === 'pushfold') return 'shortRange';
  const { depth, approximation } = model;

  const [open, threeBet] = raises;
  let role: VillainRole;
  let situation: PreflopSituation;
  let part: VillainStart['part'];
  if (raises.length === 1 && open.player === villain) {
    role = 'opener';
    situation = { kind: 'rfi', stack: depth, hero: villainPos, villain: null };
    part = 'aggressive';
  } else if (raises.length === 1 && open.player === HERO) {
    role = villainPos === 'BB' ? 'bbDefender' : 'caller';
    situation = { kind: 'vsOpen', stack: depth, hero: villainPos, villain: heroPos };
    part = 'call';
  } else if (open.player === HERO && threeBet.player === villain) {
    role = 'threeBettor';
    situation = { kind: 'vsOpen', stack: depth, hero: villainPos, villain: heroPos };
    part = 'aggressive';
  } else if (open.player === villain && threeBet.player === HERO) {
    role = 'callerVs3bet';
    situation = { kind: 'vs3bet', stack: depth, hero: villainPos, villain: heroPos };
    part = 'call';
  } else return 'unknownRange';

  let chart;
  try {
    chart = chartFor(situation);
  } catch {
    return 'unknownRange';
  }
  const flags = part === 'aggressive' ? [...chart.aggressive] : [...chart.call];
  if (!flags.some(Boolean)) return 'unknownRange';
  return { villain, position: villainPos, role, chartKey: chart.key, part, depth, approximation, effectiveBb, flags };
}
