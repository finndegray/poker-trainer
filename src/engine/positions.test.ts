import { describe, expect, it } from 'vitest';
import { DEAD_MONEY, OPEN_POSITIONS, blindOf, callerPositions, potWhenCalled, seatOf } from './positions';

describe('positions', () => {
  it('knows seats and blinds', () => {
    expect(seatOf('UTG')).toBe(0);
    expect(seatOf('BB')).toBe(7);
    expect(blindOf(seatOf('SB'))).toBe(0.5);
    expect(blindOf(seatOf('BB'))).toBe(1);
    expect(blindOf(seatOf('BTN'))).toBe(0);
    expect(DEAD_MONEY).toBe(2.5);
  });

  it('lists open and caller positions', () => {
    expect(OPEN_POSITIONS).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(callerPositions('BTN')).toEqual(['SB', 'BB']);
    expect(callerPositions('SB')).toEqual(['BB']);
  });

  it('computes the pot when called', () => {
    expect(potWhenCalled(10, seatOf('SB'), seatOf('BB'))).toBe(21);
    expect(potWhenCalled(10, seatOf('BTN'), seatOf('BB'))).toBe(21.5);
    expect(potWhenCalled(10, seatOf('UTG'), seatOf('CO'))).toBe(22.5);
  });
});
