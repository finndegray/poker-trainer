import { describe, expect, it } from 'vitest';
import { type Card, parseCard } from '../engine/cards';
import { POSITIONS, type Position, seatOf } from '../engine/positions';
import { type Rng, mulberry32 } from '../engine/rng';
import { walkHand } from '../review/hand-model';
import { type HandEvent, parseHand } from '../review/parse';
import { type Situation, type SituationSetup, type SituationStep, CHIPS_PER_BB, CHIPS_PER_STEP, addStep, bbToChips, playSituation } from './model';
import { playedAtOf, situationText } from './text';

const PLAYED_AT = '2026-10-14 18:05:09';
const cards = (text: string) => text.split(' ').map(parseCard);
const setupOf = (over: Partial<SituationSetup> = {}): SituationSetup => ({
  handId: 'SIT1760457909000',
  kind: 'normal',
  hero: 'CO',
  heroCards: [parseCard('Ah'), parseCard('Kd')],
  stacks: Object.fromEntries(POSITIONS.map((p) => [p, 25])) as Record<Position, number>,
  ...over,
});

describe('situation text', () => {
  it('writes a GGPoker hand history', () => {
    const steps: SituationStep[] = [
      { type: 'empty' },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'raise', to: bbToChips(2.2) },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'call' },
      { type: 'board', cards: cards('Qh 5c 3c') },
      { type: 'check' },
      { type: 'bet', to: bbToChips(2.5) },
      { type: 'fold' },
    ];
    expect(situationText({ setup: setupOf({ kind: 'bounty' }), steps }, PLAYED_AT).split('\n')).toEqual([
      "Poker Hand #SIT1760457909000: Tournament #SIT-bounty, Eigene Situationen (Bounty) Hold'em No Limit - Level1(400/800(100)) - 2026/10/14 18:05:09",
      "Table 'Situation' 8-max Seat #6 is the button",
      'Seat 2: Spieler2 (20,000 in chips)',
      'Seat 3: Spieler3 (20,000 in chips)',
      'Seat 4: Spieler4 (20,000 in chips)',
      'Seat 5: Hero (20,000 in chips)',
      'Seat 6: Spieler6 (20,000 in chips)',
      'Seat 7: Spieler7 (20,000 in chips)',
      'Seat 8: Spieler8 (20,000 in chips)',
      'Spieler2: posts the ante 100',
      'Spieler3: posts the ante 100',
      'Spieler4: posts the ante 100',
      'Hero: posts the ante 100',
      'Spieler6: posts the ante 100',
      'Spieler7: posts the ante 100',
      'Spieler8: posts the ante 100',
      'Spieler7: posts small blind 400',
      'Spieler8: posts big blind 800',
      '*** HOLE CARDS ***',
      'Dealt to Spieler2 ',
      'Dealt to Spieler3 ',
      'Dealt to Spieler4 ',
      'Dealt to Hero [Ah Kd]',
      'Dealt to Spieler6 ',
      'Dealt to Spieler7 ',
      'Dealt to Spieler8 ',
      'Spieler2: folds',
      'Spieler3: folds',
      'Spieler4: folds',
      'Hero: raises 960 to 1,760',
      'Spieler6: folds',
      'Spieler7: folds',
      'Spieler8: calls 960',
      '*** FLOP *** [Qh 5c 3c]',
      'Spieler8: checks',
      'Hero: bets 2,000',
      'Spieler8: folds',
      'Uncalled bet (2,000) returned to Hero',
      '*** SHOWDOWN ***',
      'Hero collected 4,620 from pot',
      '*** SUMMARY ***',
      'Total pot 4,620 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0',
      'Board [Qh 5c 3c]',
    ]);
  });

  it('formats the local time as the hand history prints it', () => {
    expect(playedAtOf(new Date(2026, 9, 4, 8, 5, 9))).toBe('2026-10-04 08:05:09');
  });

  it('writes the turn and river lines with the board so far and a partial hand without a showdown', () => {
    const steps: SituationStep[] = [{ type: 'raise', to: 999_999 }, ...Array.from({ length: 6 }, () => ({ type: 'fold' }) as const), { type: 'call' }];
    const runout = [cards('2c 7d 9h'), cards('Js'), cards('3s')].reduce<Situation>(
      (s, c) => addStep(s, { type: 'board', cards: c }),
      { setup: setupOf({ hero: 'BB' }), steps },
    );
    const lines = situationText(runout, PLAYED_AT).split('\n');
    expect(lines).toContain('*** TURN *** [2c 7d 9h] [Js]');
    expect(lines).toContain('*** RIVER *** [2c 7d 9h Js] [3s]');
    expect(lines.slice(-4)).toEqual(['*** SHOWDOWN ***', '*** SUMMARY ***', 'Total pot 41,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0', 'Board [2c 7d 9h Js 3s]']);
    const partial = situationText({ setup: setupOf(), steps: [] }, PLAYED_AT).split('\n');
    expect(partial.slice(-2)).toEqual(['*** SUMMARY ***', 'Total pot 2,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0']);
    expect(parseHand(partial.join('\n')).events).toHaveLength(10);
  });
});

/** A random legal situation: every step is chosen among the actions the model allows at that point. */
function randomSituation(rng: Rng, n: number): Situation {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const deck: Card[] = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  // About 12% are 1-2 BB stacks: a big blind that cannot post in full, short opening all-ins, cumulative short all-ins.
  const randomStack = () =>
    rng() < 0.12 ? 1 + Math.floor(rng() * 11) / 10 : rng() < 0.3 ? 1 + Math.floor(rng() * 100) / 10 : 1 + Math.floor(rng() * 1991) / 10;
  const base = randomStack();
  // One in four tables mixes in short stacks (1.2-4 BB) next to deep ones, so several players go all-in for different
  // small amounts while someone who already acted still has chips to raise again.
  const mixed = rng() < 0.3;
  const stacks = Object.fromEntries(
    POSITIONS.map((p) => [p, mixed ? (seatOf(p) < 3 ? 30 + Math.floor(rng() * 100) / 10 : 1.2 + Math.floor(rng() * 29) / 10) : rng() < 0.5 ? base : randomStack()]),
  ) as Record<Position, number>;
  const kinds = ['normal', 'satellit', 'bounty'] as const;
  const setup: SituationSetup = { handId: `SIT${n}`, kind: pick(kinds), hero: pick(POSITIONS), heroCards: [deck.pop()!, deck.pop()!], stacks };
  let situation: Situation = { setup, steps: [] };
  const mixedTable = mixed;
  for (let guard = 0; guard < 80; guard++) {
    const state = playSituation(situation);
    const { phase } = state;
    let step: SituationStep;
    if (phase.type === 'act') {
      const legal = phase.legal;
      const options: SituationStep[] = [];
      if (legal.empty && rng() < 0.4) options.push({ type: 'empty' });
      // Villains fold often (so hands end with one player left), the hero rarely (so hands go deep).
      if (legal.fold && (!legal.isHero || rng() < 0.3)) {
        for (let i = 0; i < (legal.isHero ? 1 : mixedTable ? 1 : 4); i++) options.push({ type: 'fold' });
      }
      if (legal.check) options.push({ type: 'check' });
      if (legal.call) options.push({ type: 'call' }, { type: 'call' });
      const range = legal.bet ?? legal.raise;
      if (range) {
        const type = legal.bet ? 'bet' : 'raise';
        const steps = Math.floor((range.max - range.min) / CHIPS_PER_STEP);
        options.push({ type, to: range.min + CHIPS_PER_STEP * Math.floor(rng() * (steps + 1)) });
        options.push({ type, to: rng() < 0.5 ? range.max : 999_999 });
        if (legal.suggested !== null) options.push({ type, to: legal.suggested });
        // Short stacks shove often, which makes the small all-ins that add up to a full raise.
        if (range.max < 5 * CHIPS_PER_BB) options.push({ type, to: range.max }, { type, to: range.max }, { type, to: range.max });
      }
      if (options.length === 0) options.push(legal.fold ? { type: 'fold' } : { type: 'check' });
      step = pick(options);
    } else if (phase.type === 'board') {
      step = phase.optional && rng() < 0.3 ? { type: 'end' } : { type: 'board', cards: deck.splice(0, phase.count) };
    } else if (phase.type === 'done' && state.showable.length > 0 && rng() < 0.6) {
      step = { type: 'show', position: pick(state.showable), cards: [deck.pop()!, deck.pop()!] };
    } else break;
    situation = addStep(situation, step);
  }
  return situation;
}

/** TDA edge cases seen in a situation's events: short big blind, short opening all-in, raise after cumulative short all-ins. */
function edgeCases(events: readonly HandEvent[]): Set<string> {
  const found = new Set<string>();
  const acted = new Map<string, number>();
  let street = 'preflop';
  let maxBet = 0;
  let lastRaise = 800;
  let sinceFull: string[] = [];
  for (const e of events) {
    if (e.type === 'bigBlind') {
      maxBet = 800;
      if (e.amount < 700 || (e.amount === 700 && e.allIn)) found.add('shortBigBlind');
    } else if (e.type === 'uncalled' && street === 'preflop' && found.has('shortBigBlind')) found.add('uncalledPreflop');
    else if (e.type === 'board') {
      street = e.street;
      maxBet = 0;
      lastRaise = 800;
      acted.clear();
      sinceFull = [];
    } else if (e.type === 'action') {
      const to = e.action === 'bet' || e.action === 'raise' ? e.to ?? e.amount : null;
      if (e.action === 'raise' && acted.has(e.player) && sinceFull.length > 1) found.add('cumulativeReopen');
      if (to !== null) {
        const raised = to - maxBet;
        if (maxBet === 0 && raised < 800 && e.allIn) found.add('shortOpeningAllIn');
        if (maxBet === 0 || raised >= lastRaise) {
          lastRaise = Math.max(raised, maxBet === 0 ? 800 : 0);
          acted.clear();
          sinceFull = [];
        } else sinceFull.push(e.player);
        maxBet = to;
      }
      acted.set(e.player, maxBet);
    }
  }
  return found;
}

describe('round trip: situation → text → parser → table', () => {
  it('gives the same events and the same table after every step, for many random situations', () => {
    const rng = mulberry32(20261014);
    let checked = 0;
    const phases = new Set<string>();
    const edges = new Set<string>();
    for (let n = 0; n < 400; n++) {
      const situation = randomSituation(rng, n);
      for (const edge of edgeCases(playSituation(situation).events)) edges.add(edge);
      for (let k = 0; k <= situation.steps.length; k++) {
        const prefix = { setup: situation.setup, steps: situation.steps.slice(0, k) };
        const state = playSituation(prefix);
        const hand = parseHand(situationText(prefix, PLAYED_AT));
        expect(hand.events).toEqual(state.events);
        expect(walkHand(hand)).toEqual(state.states);
        expect(hand.totalPot).toBe(state.table.pot);
        expect(hand.heroCards).toEqual(situation.setup.heroCards);
        phases.add(state.phase.type === 'done' ? state.phase.reason : state.phase.type);
        checked++;
      }
    }
    // With this seed: about 5,500 steps in 400 situations, including the short big blind, short opening all-in and cumulative short all-in cases.
    expect(checked).toBeGreaterThan(4000);
    expect([...edges].sort()).toEqual(['cumulativeReopen', 'shortBigBlind', 'shortOpeningAllIn', 'uncalledPreflop']);
    expect([...phases].sort()).toEqual(['act', 'board', 'folded', 'heroFolded', 'showdown']);
  });
});
