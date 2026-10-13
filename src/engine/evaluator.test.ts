import { describe, expect, it } from 'vitest';
import { parseCard } from './cards';
import { categoryOf, evaluate7 } from './evaluator';

const ev = (s: string) => evaluate7(s.split(' ').map(parseCard));

describe('evaluate7', () => {
  it('detects every category', () => {
    expect(categoryOf(ev('As Ks Qs Js Ts 2c 3d'))).toBe(8);
    expect(categoryOf(ev('9h 9d 9s 9c Ks 2c 3d'))).toBe(7);
    expect(categoryOf(ev('9h 9d 9s Kc Ks 2c 3d'))).toBe(6);
    expect(categoryOf(ev('2h 7h 9h Jh Kh 2c 3d'))).toBe(5);
    expect(categoryOf(ev('5c 6d 7h 8s 9c Kd 2h'))).toBe(4);
    expect(categoryOf(ev('9h 9d 9s Kc Qs 2c 3d'))).toBe(3);
    expect(categoryOf(ev('9h 9d Ks Kc Qs 2c 3d'))).toBe(2);
    expect(categoryOf(ev('9h 9d As Kc Qs 2c 3d'))).toBe(1);
    expect(categoryOf(ev('9h 8d As Kc Qs 2c 3d'))).toBe(0);
  });

  it('handles the wheel and the wheel straight flush', () => {
    expect(categoryOf(ev('Ac 2d 3h 4s 5c Kd Qh'))).toBe(4);
    expect(ev('Ac 2d 3h 4s 5c Kd Qh')).toBeLessThan(ev('2c 3d 4h 5s 6c Kd Qh'));
    expect(categoryOf(ev('Ah 2h 3h 4h 5h Kd Qc'))).toBe(8);
  });

  it('compares kickers correctly', () => {
    expect(ev('As Ad Kc 7h 5s 3c 2d')).toBeGreaterThan(ev('As Ad Qc 7h 5s 3c 2d'));
    expect(ev('Ks Kd 7c 7h As 3c 2d')).toBeGreaterThan(ev('Ks Kd 7c 7h Qs 3c 2d'));
    expect(ev('Ks Kd 7c 7h 3s 3c Ad')).toBe(ev('Ks Kd 7c 7h 2s 2c Ad'));
  });

  it('picks the best full house from two trips', () => {
    expect(ev('9h 9d 9s Kc Ks Kd 3d')).toBeGreaterThan(ev('9h 9d 9s Qc Qs Qd 3d'));
    expect(categoryOf(ev('9h 9d 9s Kc Ks Kd 3d'))).toBe(6);
  });

  it('prefers a flush over a straight in the same seven cards', () => {
    expect(categoryOf(ev('5h 6h 7d 8h 9c Kh 2h'))).toBe(5);
  });

  it('detects ties on the board', () => {
    expect(ev('2c 3d As Ks Qs Js Ts')).toBe(ev('4c 5d As Ks Qs Js Ts'));
  });
});
