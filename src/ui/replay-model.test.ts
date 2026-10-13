import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { analyzeHand } from '../review/analysis';
import bounty from '../review/fixtures/bounty.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { parseHand, parseHistory } from '../review/parse';
import { replaySteps, replayTableModel } from './replay-model';

const hand = parseHand(bounty);
const decisions = analyzeHand(hand, getPushFoldData()).decisions;

describe('replaySteps', () => {
  const list = replaySteps(hand, decisions);

  it('starts after the posts and has one step per event', () => {
    expect(list[0]).toMatchObject({ eventIndex: null, text: 'Karten verteilt', decision: null });
    const posts = hand.events.filter((e) => e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind').length;
    expect(list).toHaveLength(hand.events.length - posts + 1);
    expect(list[0].state.pot).toBe(8 * 18 + 60 + 120);
  });

  it('shows the table before each hero decision and names the choice', () => {
    const heroSteps = list.filter((s) => s.decision);
    expect(heroSteps).toHaveLength(6);
    expect(heroSteps[0].text).toBe('Du bist dran – deine Wahl: Raise auf 3 BB');
    expect(heroSteps[0].state.players.find((p) => p.isHero)?.streetBet).toBe(0);
    expect(heroSteps[3].text).toBe('Du bist dran – deine Wahl: Call 17,1 BB');
  });

  it('describes the other events in German with positions and BB', () => {
    const texts = list.filter((s) => !s.decision).map((s) => s.text);
    expect(texts).toContain('UTG+1: Fold');
    expect(texts).toContain('CO: Call 3 BB');
    expect(texts).toContain('Flop: 8h 9c 7h');
    expect(texts).toContain('CO: Raise auf 30,1 BB');
    expect(texts).toContain('CO: 88 BB zurück');
    expect(texts).toContain('CO gewinnt 77,6 BB');
  });
});

describe('replayTableModel', () => {
  it('places the seated players around the hero with stacks, bets and the board pot', () => {
    const list = replaySteps(hand, decisions);
    const turnRaise = list.find((s) => s.text === 'CO: Raise auf 30,1 BB')!;
    const model = replayTableModel(turnRaise.state, hand.bigBlind);
    expect(model.seats).toHaveLength(8);
    const hero = model.seats.find((s) => s.role === 'hero')!;
    expect(hero).toMatchObject({ position: 'UTG', offset: 0, betBb: 13.1, stackBb: 57.9 });
    expect(model.seats.find((s) => s.position === 'CO')).toMatchObject({ role: 'raiser', betBb: 30.1 });
    expect(model.seats.filter((s) => s.role === 'folded')).toHaveLength(6);
    expect(model.potBb).toBe(60.6);
  });

  it('marks all-in players and works at a short-handed table', () => {
    const h = parseHistory(steps).hands.find((x) => x.id === 'TM6532799440')!;
    const list = replaySteps(h, analyzeHand(h, getPushFoldData()).decisions);
    const model = replayTableModel(list[0].state, h.bigBlind);
    expect(model.seats.map((s) => s.position)).toEqual(['BB', 'HJ', 'CO', 'BTN', 'SB']);
    expect(model.seats.find((s) => s.position === 'BB')).toMatchObject({ betLabel: 'All-in', betBb: 0.5, stackBb: 0 });
    expect(model.seats.find((s) => s.isButton)?.position).toBe('BTN');
  });
});
