import { ANTE, DEAD_MONEY, POSITIONS, POSITION_LABELS, type Position, blindOf, seatOf } from '../engine/positions';
import { type PreflopSpot, betsFor } from '../engine/preflop/spots';
import type { Spot } from '../engine/pushfold';

export type SeatRole = 'hero' | 'shover' | 'raiser' | 'folded' | 'waiting';
export type SeatModel = {
  position: Position;
  label: string;
  role: SeatRole;
  offset: number;
  isButton: boolean;
  betBb: number;
  anteBb: number;
  /** Highlighted bet such as "All-in", "Raise" or "3-Bet"; null shows a plain amount. */
  betLabel: string | null;
  /** Chips behind, shown for the players in a starthand spot; null hides the stack. */
  stackBb: number | null;
};
export type TableModel = { seats: SeatModel[]; playersBehind: number; potBb: number; heroStackBb: number };

const BTN_SEAT = seatOf('BTN');
const BB_SEAT = seatOf('BB');

const round1 = (x: number): number => Math.round(x * 10) / 10;
const offsetOf = (seat: number, heroSeat: number): number => (seat - heroSeat + POSITIONS.length) % POSITIONS.length;

export function tableModel(spot: Spot): TableModel {
  const heroSeat = seatOf(spot.position);
  const shoverSeat = spot.kind === 'call' ? seatOf(spot.shover) : -1;
  const seats = POSITIONS.map((position, seat): SeatModel => {
    const role: SeatRole =
      seat === heroSeat ? 'hero' : seat === shoverSeat ? 'shover' : seat < heroSeat ? 'folded' : 'waiting';
    return {
      position,
      label: POSITION_LABELS[position],
      role,
      offset: offsetOf(seat, heroSeat),
      isButton: seat === BTN_SEAT,
      betBb: role === 'shover' ? spot.stack : blindOf(seat),
      anteBb: seat === BB_SEAT ? ANTE : 0,
      betLabel: role === 'shover' ? 'All-in' : null,
      stackBb: null,
    };
  });
  const potBb = DEAD_MONEY + (shoverSeat >= 0 ? spot.stack - blindOf(shoverSeat) : 0);
  return {
    seats,
    playersBehind: seats.filter((s) => s.role === 'waiting').length,
    potBb,
    heroStackBb: spot.stack,
  };
}

/** Starthand spot: open-raise and 3-bet are shown as bets (betsFor), uninvolved players have folded or still wait. */
export function preflopTableModel(spot: PreflopSpot): TableModel {
  const bets = betsFor(spot);
  const heroSeat = seatOf(spot.hero);
  const villainSeat = spot.villain === null ? -1 : seatOf(spot.villain);
  const raiseLabel = spot.kind === 'vsOpen' ? 'Raise' : '3-Bet';
  const seats = POSITIONS.map((position, seat): SeatModel => {
    let role: SeatRole;
    if (seat === heroSeat) role = 'hero';
    else if (seat === villainSeat) role = 'raiser';
    // Facing a 3-bet, everybody else has already folded.
    else if (spot.kind === 'vs3bet') role = 'folded';
    else role = seat < heroSeat ? 'folded' : 'waiting';
    const betBb = role === 'hero' ? bets.heroPosted : role === 'raiser' ? (bets.villainPosted ?? 0) : blindOf(seat);
    return {
      position,
      label: POSITION_LABELS[position],
      role,
      offset: offsetOf(seat, heroSeat),
      isButton: seat === BTN_SEAT,
      betBb,
      anteBb: seat === BB_SEAT ? ANTE : 0,
      betLabel: role === 'raiser' ? raiseLabel : null,
      stackBb: role === 'hero' || role === 'raiser' ? round1(spot.stack - betBb) : null,
    };
  });
  return {
    seats,
    playersBehind: seats.filter((s) => s.role === 'waiting').length,
    potBb: round1(ANTE + seats.reduce((sum, s) => sum + s.betBb, 0)),
    heroStackBb: spot.stack,
  };
}
