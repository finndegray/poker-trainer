export const POSITIONS = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  UTG: 'UTG', UTG1: 'UTG+1', LJ: 'LJ', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB',
};

export const ANTE = 1;
const SB_BLIND = 0.5;
const BB_BLIND = 1;
export const DEAD_MONEY = ANTE + SB_BLIND + BB_BLIND;

const SB_SEAT = 6;
const BB_SEAT = 7;

export const seatOf = (p: Position): number => POSITIONS.indexOf(p);

export function blindOf(seat: number): number {
  if (seat === SB_SEAT) return SB_BLIND;
  if (seat === BB_SEAT) return BB_BLIND;
  return 0;
}

export const OPEN_POSITIONS: readonly Position[] = POSITIONS.slice(0, BB_SEAT);

export const callerPositions = (shover: Position): Position[] => POSITIONS.slice(seatOf(shover) + 1);

// Both players put in the full stack (blinds included), plus the ante and the other blinds as dead money.
export function potWhenCalled(stack: number, shoverSeat: number, callerSeat: number): number {
  return 2 * stack + ANTE + (SB_BLIND + BB_BLIND - blindOf(shoverSeat) - blindOf(callerSeat));
}
