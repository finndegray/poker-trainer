import { HAND_COUNT, type HandClass } from './cards';
import { OPEN_POSITIONS, type OpenPosition, type Position, callerPositions } from './positions';
import { MAX_STACK, MIN_STACK, type PushFoldData, callKey } from './pushfold-data';

export type Situation =
  | { kind: 'open'; position: Position; stack: number }
  | { kind: 'call'; shover: Position; position: Position; stack: number };

export type Spot = Situation & { hand: HandClass };
export type Action = 'shove' | 'call' | 'fold';
export type Verdict = 'correct' | 'close' | 'wrong';
export type Grade = { verdict: Verdict; chosen: Action; best: Action; evAggressive: number; evFold: 0 };
export type ChartCell = 'aggressive' | 'fold' | 'close-aggressive' | 'close-fold';

export const CLOSE_THRESHOLD = 0.1;

export const aggressiveAction = (s: Situation): Action => (s.kind === 'open' ? 'shove' : 'call');

export function evRow(data: PushFoldData, s: Situation): readonly number[] {
  if (!Number.isInteger(s.stack) || s.stack < MIN_STACK || s.stack > MAX_STACK) {
    throw new Error(`Ungültiger Stack: ${s.stack} BB`);
  }
  if (s.kind === 'open') {
    if (!(OPEN_POSITIONS as readonly Position[]).includes(s.position)) throw new Error(`Kein Open-Shove aus ${s.position} möglich`);
    return data.openShove[s.position as OpenPosition][s.stack - 1];
  }
  if (!(OPEN_POSITIONS as readonly Position[]).includes(s.shover) || !callerPositions(s.shover).includes(s.position)) {
    throw new Error(`Ungültiger Call-Spot: ${s.position} gegen Shove aus ${s.shover}`);
  }
  return data.callVsShove[callKey(s.shover, s.position)][s.stack - 1];
}

export function evOf(data: PushFoldData, spot: Spot): number {
  if (!Number.isInteger(spot.hand) || spot.hand < 0 || spot.hand >= HAND_COUNT) {
    throw new Error(`Ung�ltiger Hand-Index: ${spot.hand}`);
  }
  return evRow(data, spot)[spot.hand];
}

export function grade(data: PushFoldData, spot: Spot, chosen: Action): Grade {
  const aggressive = aggressiveAction(spot);
  if (chosen !== aggressive && chosen !== 'fold') {
    throw new Error(`Aktion ${chosen} passt nicht zum Spot`);
  }
  const ev = evOf(data, spot);
  const best: Action = ev > 0 ? aggressive : 'fold';
  const verdict: Verdict = Math.abs(ev) < CLOSE_THRESHOLD ? 'close' : chosen === best ? 'correct' : 'wrong';
  return { verdict, chosen, best, evAggressive: ev, evFold: 0 };
}

export function chart(data: PushFoldData, s: Situation): ChartCell[] {
  return evRow(data, s).map((ev): ChartCell =>
    Math.abs(ev) < CLOSE_THRESHOLD
      ? ev > 0 ? 'close-aggressive' : 'close-fold'
      : ev > 0 ? 'aggressive' : 'fold',
  );
}
