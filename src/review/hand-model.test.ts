import { describe, expect, it } from 'vitest';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { maxStreetBet, playableChips, positionsOf, walkHand } from './hand-model';
import { HERO, parseHand, parseHistory } from './parse';
import { ggHand } from './test-hands';
import { TOURNAMENT_KIND_LABELS, detectTournamentKind, isTournamentKind } from './tournament-kind';

const daily = parseHistory(dailyClassic).hands;
const hand = (id: string) => [...daily, ...parseHistory(steps).hands].find((h) => h.id === id)!;

describe('detectTournamentKind', () => {
  it('finds satellites, bounty tournaments and normal ones by name', () => {
    expect(detectTournamentKind('$0.50 Step to The Weekender')).toBe('satellit');
    expect(detectTournamentKind('T$ Builder $1')).toBe('satellit');
    expect(detectTournamentKind('Sunday Million Satellite')).toBe('satellit');
    expect(detectTournamentKind('WSOP Ticket Race')).toBe('satellit');
    expect(detectTournamentKind('Seat Hunter')).toBe('satellit');
    expect(detectTournamentKind('Bounty Hunters $2.50')).toBe('bounty');
    expect(detectTournamentKind('$5 PKO Rush')).toBe('bounty');
    expect(detectTournamentKind('Mystery Bounty')).toBe('bounty');
    expect(detectTournamentKind('Knockout Special')).toBe('bounty');
    expect(detectTournamentKind('Daily Classic $1')).toBe('normal');
    expect(detectTournamentKind('Stepladder Deepstack')).toBe('normal');
  });

  it('has German labels and a type guard', () => {
    expect(TOURNAMENT_KIND_LABELS).toEqual({ normal: 'Normal', satellit: 'Satellit', bounty: 'Bounty' });
    expect(isTournamentKind('bounty')).toBe(true);
    expect(isTournamentKind('Bounty')).toBe(false);
  });
});

describe('positionsOf', () => {
  it('maps a full 8-max table from the blinds and the button', () => {
    const positions = positionsOf(hand('TM6532734973'))!;
    expect(Object.fromEntries(positions)).toEqual({
      '782fbbaf': 'UTG', f982e6ef: 'UTG1', '9b4b9f25': 'LJ', Hero: 'HJ', '52f864b': 'CO', '6cb36585': 'BTN', af26c20d: 'SB', b0249070: 'BB',
    });
  });

  it('drops the early positions at a short-handed table', () => {
    const seven = positionsOf(hand('TM6532800963'))!;
    expect(seven.get(HERO)).toBe('UTG1');
    expect(seven.get('cb96225f')).toBe('BTN');
    expect([...seven.values()]).not.toContain('UTG');
    const five = positionsOf(hand('TM6532799440'))!;
    expect(Object.fromEntries(five)).toEqual({ '3d93b9d2': 'HJ', fbdde14e: 'CO', '3e9ba0b6': 'BTN', Hero: 'SB', '16564bde': 'BB' });
  });

  it('gives up without a big blind', () => {
    const h = parseHand(ggHand({ hero: 'CO', lines: ['UTG: folds'] }));
    expect(positionsOf({ ...h, events: h.events.filter((e) => e.type !== 'bigBlind') })).toBeNull();
  });
});

describe('walkHand', () => {
  it('tracks pot, street bets, stacks and folds before every event', () => {
    const h = hand('TM6532734973');
    const states = walkHand(h);
    expect(states).toHaveLength(h.events.length + 1);
    const heroShove = h.events.findIndex((e) => e.type === 'action' && e.player === HERO);
    const before = states[heroShove];
    expect(before.street).toBe('preflop');
    expect(before.pot).toBe(8 * 150 + 600 + 1200);
    expect(maxStreetBet(before)).toBe(1200);
    expect(before.players.find((p) => p.isHero)).toMatchObject({ stack: 19680, streetBet: 0, folded: false, position: 'HJ' });
    expect(before.players.find((p) => p.name === '782fbbaf')?.folded).toBe(true);
    const end = states[states.length - 1];
    expect(end.pot).toBe(h.totalPot);
    expect(end.board).toEqual(h.board);
    expect(end.players.find((p) => p.isHero)?.allIn).toBe(true);
  });

  it('resets street bets on each new street and returns uncalled bets', () => {
    const h = parseHand(bounty);
    const states = walkHand(h);
    const flop = h.events.findIndex((e) => e.type === 'board');
    expect(states[flop + 1].players.every((p) => p.streetBet === 0)).toBe(true);
    expect(states[flop + 1].pot).toBe(8 * 18 + 60 + 120 + 360 + 360);
    expect(states[states.length - 1].pot).toBe(9312);
  });

  it('counts the playable chips without the ante', () => {
    expect(playableChips(hand('TM6532734973'), HERO)).toBe(19680);
    expect(playableChips(hand('TM6532734973'), 'nobody')).toBe(0);
  });
});
