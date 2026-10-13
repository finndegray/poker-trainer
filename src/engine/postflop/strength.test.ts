import { describe, expect, it } from 'vitest';
import { parseCard } from '../cards';
import { comboIndex } from './combos';
import { comboStrengths, drawOuts, straightHigh } from './strength';

const cards = (s: string) => s.split(' ').map(parseCard);
const outs = (hole: string, board: string) => drawOuts(cards(hole), cards(board));
const mask = (ranks: string) => [...ranks].reduce((m, r) => m | (1 << '23456789TJQKA'.indexOf(r)), 0);

describe('straightHigh', () => {
  it('finds the highest straight and the wheel', () => {
    expect(straightHigh(mask('9TJQK'))).toBe(11);
    expect(straightHigh(mask('89TJQKA'))).toBe(12);
    expect(straightHigh(mask('A2345'))).toBe(3);
    expect(straightHigh(mask('A2346'))).toBe(-1);
  });
});

describe('drawOuts', () => {
  it('counts 9 outs for a flush draw and 8 for an open-ended straight draw', () => {
    expect(outs('Ah Kh', 'Qh 7h 2c')).toEqual({ flushOuts: 9, straightOuts: 0, outs: 9 });
    expect(outs('9c 8d', '7h 6s 2c')).toEqual({ flushOuts: 0, straightOuts: 8, outs: 8 });
  });

  it('counts a gutshot with 4 outs and a combo draw without double counting', () => {
    expect(outs('9c 8d', 'Jh 7s 2c').outs).toBe(4);
    expect(outs('Ac 2d', '3h 4s 9c').outs).toBe(4);
    // Flush draw plus open-ended: 9 + 8 − 2 shared cards (the 5♥ and the T♥).
    expect(outs('9h 8h', '7h 6s 2h')).toEqual({ flushOuts: 9, straightOuts: 8, outs: 15 });
  });

  it('ignores draws the board makes alone, made hands and the river', () => {
    // Four to a straight on the board: the hole cards add nothing.
    expect(outs('2c 2d', '9h Ts Jc Qd').straightOuts).toBe(0);
    // Four hearts on the board, none in the hand.
    expect(outs('Ac Kd', '2h 7h 9h Jh').flushOuts).toBe(0);
    expect(outs('Kc Qd', 'Jh Ts 9c').outs).toBe(0);
    expect(outs('Ah Kh', 'Qh 7h 2h').outs).toBe(0);
    expect(outs('Ah Kh', 'Qh 7h 2c 3d 4s').outs).toBe(0);
  });
});

describe('comboStrengths', () => {
  const board = cards('Ks 7d 2c');
  const strength = comboStrengths(board, 0.04);
  const of = (a: string, b: string) => strength[comboIndex(parseCard(a), parseCard(b))];

  it('orders made hands: set over top pair over middle pair over nothing', () => {
    expect(of('7h', '7c')).toBeGreaterThan(of('Ah', 'Kd'));
    expect(of('Ah', 'Kd')).toBeGreaterThan(of('8h', '7c'));
    expect(of('8h', '7c')).toBeGreaterThan(of('Jh', '9c'));
    expect(of('7h', '7c')).toBeLessThanOrEqual(1);
  });

  it('lifts draws by their outs and is 0 for combos that hold a board card', () => {
    const drawBoard = cards('Qh 7h 2c');
    const withDraw = comboStrengths(drawBoard, 0.04);
    const without = comboStrengths(drawBoard, 0);
    const i = comboIndex(parseCard('Ah'), parseCard('5h'));
    expect(withDraw[i]).toBeGreaterThan(without[i] + 0.15);
    expect(of('Ks', 'Kd')).toBe(0);
  });
});
