import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { HERO, type HandEvent, type ParsedHand, parseHand, parseHistory, splitHands } from './parse';

const cards = (text: string) => text.split(' ').map(parseCard);
const byId = (hands: ParsedHand[], id: string) => hands.find((h) => h.id === id)!;
const actions = (hand: ParsedHand) =>
  hand.events.filter((e): e is Extract<HandEvent, { type: 'action' }> => e.type === 'action');

describe('splitHands', () => {
  it('splits a GGPoker file into hands, newest first as in the file', () => {
    const { hands, rest } = splitHands(dailyClassic);
    expect(rest).toBe('');
    expect(hands.map((h) => h.slice(0, 25))).toEqual([
      'Poker Hand #TM6532448269:',
      'Poker Hand #TM6532734973:',
      'Poker Hand #TM6533069892:',
      'Poker Hand #TM6533069879:',
      'Poker Hand #TM6532186101:',
      'Poker Hand #TM6532800963:',
    ]);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const { hands } = splitHands(`﻿${dailyClassic.replace(/\n/g, '\r\n')}`);
    expect(hands).toHaveLength(6);
    expect(hands[0]).not.toContain('\r');
  });
});

describe('parseHand', () => {
  const daily = parseHistory(dailyClassic).hands;

  it('reads header, table, seats, blinds, antes and the hero cards', () => {
    const hand = byId(daily, 'TM6532448269');
    expect(hand).toMatchObject({
      tournamentId: '318096259',
      tournamentName: 'Daily Classic $1',
      level: 19,
      smallBlind: 1500,
      bigBlind: 3000,
      ante: 350,
      playedAt: '2026-10-13 15:46:28',
      dateKey: '2026-10-13',
      tableSize: 8,
      buttonSeat: 4,
      totalPot: 67974,
    });
    expect(hand.seats[1]).toEqual({ seat: 2, name: '5c98de81', chips: 193255 });
    expect(hand.seats.find((s) => s.name === HERO)).toEqual({ seat: 3, name: HERO, chips: 56377 });
    expect(hand.heroCards).toEqual(cards('Qd Ad'));
    expect(hand.events.filter((e) => e.type === 'ante')).toHaveLength(8);
    expect(hand.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: '5858e747', amount: 3000, allIn: false });
  });

  it('reads raises as "to" totals, all-ins, the uncalled bet, shows and the board', () => {
    const hand = byId(daily, 'TM6532448269');
    expect(actions(hand)[0]).toEqual({
      type: 'action', street: 'preflop', player: '77e1f37f', action: 'raise', amount: 30337, to: 30337, allIn: true,
    });
    expect(actions(hand)[4]).toEqual({
      type: 'action', street: 'preflop', player: HERO, action: 'raise', amount: 56027, to: 56027, allIn: true,
    });
    expect(hand.events).toContainEqual({ type: 'uncalled', player: HERO, amount: 25690 });
    expect(hand.events).toContainEqual({ type: 'show', player: '77e1f37f', cards: cards('Ah Ts') });
    expect(hand.events.filter((e) => e.type === 'board')).toEqual([
      { type: 'board', street: 'flop', cards: cards('Qh 5c 3c') },
      { type: 'board', street: 'turn', cards: cards('6d') },
      { type: 'board', street: 'river', cards: cards('4c') },
    ]);
    expect(hand.board).toEqual(cards('Qh 5c 3c 6d 4c'));
    expect(hand.events).toContainEqual({ type: 'collect', player: HERO, amount: 67974 });
  });

  it('counts what a raise adds on top of the blind already posted', () => {
    const hand = byId(daily, 'TM6533069892');
    expect(actions(hand).slice(-3)).toEqual([
      { type: 'action', street: 'preflop', player: '257eeaf0', action: 'raise', amount: 625, to: 750, allIn: false },
      { type: 'action', street: 'preflop', player: HERO, action: 'raise', amount: 2250, to: 2500, allIn: false },
      { type: 'action', street: 'preflop', player: '257eeaf0', action: 'fold', amount: 0, to: null, allIn: false },
    ]);
  });

  it('reads postflop bets, raises and calls street by street', () => {
    const hand = parseHand(bounty);
    expect(actions(hand).filter((a) => a.street !== 'preflop').map((a) => [a.street, a.player, a.action, a.amount])).toEqual([
      ['flop', HERO, 'bet', 522],
      ['flop', '3c9caf34', 'call', 522],
      ['turn', HERO, 'bet', 1566],
      ['turn', '3c9caf34', 'raise', 3612],
      ['turn', HERO, 'call', 2046],
      ['river', HERO, 'check', 0],
      ['river', '3c9caf34', 'bet', 10560],
      ['river', HERO, 'fold', 0],
    ]);
    expect(hand.tournamentName).toBe('Bounty Hunters $2.50');
  });

  it('handles seat gaps, a big blind that puts the player all-in and shows before the board is complete', () => {
    const hand = byId(parseHistory(steps).hands, 'TM6532799440');
    expect(hand.seats.map((s) => s.seat)).toEqual([1, 5, 6, 7, 8]);
    expect(hand.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: '16564bde', amount: 20, allIn: true });
    const order = hand.events.map((e) => e.type);
    expect(order.indexOf('show')).toBeLessThan(order.lastIndexOf('board'));
    expect(hand.tournamentName).toBe('$0.50 Step to The Weekender');
  });

  it('keeps an all-in call that is smaller than the bet', () => {
    const hand = byId(parseHistory(steps).hands, 'TM6532443900');
    expect(actions(hand).find((a) => a.player === '3c65dbb1' && a.street === 'flop' && a.action === 'call')).toEqual({
      type: 'action', street: 'flop', player: '3c65dbb1', action: 'call', amount: 571, to: null, allIn: true,
    });
    expect(hand.events).toContainEqual({ type: 'uncalled', player: HERO, amount: 56 });
  });

  it('stores the hand text with LF line endings', () => {
    const hand = parseHand(bounty.replace(/\n/g, '\r\n'));
    expect(hand.raw).toBe(bounty.trim());
  });
});

describe('parseHistory', () => {
  it('reads every fixture hand', () => {
    expect(parseHistory(dailyClassic).hands).toHaveLength(6);
    expect(parseHistory(steps).hands.map((h) => h.tournamentId)).toEqual(['318586851', '318586827']);
    expect(parseHistory(bounty).skipped).toEqual([]);
  });

  it('skips unreadable hands with a reason and goes on', () => {
    const noHero = bounty.replace(/Hero/g, 'Villain');
    const broken = bounty.replace('Hero: bets 522', 'Hero: winks 522').replace('TM6532114653', 'TM1');
    const cash = 'Poker Hand #RC123: Hold\'em No Limit ($0.01/$0.02) - 2026/10/13 12:00:00\nTable \'x\' 6-max Seat #1 is the button';
    const result = parseHistory(['Mein Text vorweg', noHero, broken, cash, dailyClassic].join('\n\n'));
    expect(result.hands).toHaveLength(6);
    expect(result.skipped).toEqual([
      { id: null, reason: 'Format nicht erkannt' },
      { id: 'TM6532114653', reason: 'kein Hero' },
      { id: 'TM1', reason: 'Zeile nicht erkannt: Hero: winks 522' },
      { id: 'RC123', reason: 'Format nicht erkannt' },
    ]);
  });

  it('rejects a hand whose pot does not add up', () => {
    const wrongPot = bounty.replace('Total pot 9,312', 'Total pot 9,999');
    expect(parseHistory(wrongPot).skipped).toEqual([{ id: 'TM6532114653', reason: 'Pot passt nicht zu den Einsätzen' }]);
  });

  it('keeps a hand without hole cards; the analysis marks it as not rated', () => {
    const hand = parseHand(bounty.replace('Dealt to Hero [6c 6d]', 'Dealt to Hero '));
    expect(hand.heroCards).toBeNull();
  });
});
