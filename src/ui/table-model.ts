import { ANTE, DEAD_MONEY, POSITIONS, POSITION_LABELS, type Position, blindOf, seatOf } from '../engine/positions';
import type { Spot } from '../engine/pushfold';

export type SeatRole = 'hero' | 'shover' | 'folded' | 'waiting';
export type SeatModel = {
  position: Position;
  label: string;
  role: SeatRole;
  offset: number;
  isButton: boolean;
  betBb: number;
  anteBb: number;
};
export type TableModel = { seats: SeatModel[]; playersBehind: number; potBb: number; heroStackBb: number };

const BTN_SEAT = seatOf('BTN');
const BB_SEAT = seatOf('BB');

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
      offset: (seat - heroSeat + POSITIONS.length) % POSITIONS.length,
      isButton: seat === BTN_SEAT,
      betBb: role === 'shover' ? spot.stack : blindOf(seat),
      anteBb: seat === BB_SEAT ? ANTE : 0,
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
