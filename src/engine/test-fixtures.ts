import { HAND_COUNT } from './cards';
import { OPEN_POSITIONS, callerPositions } from './positions';
import type { Situation } from './pushfold';
import { MAX_STACK, MIN_STACK, callKey, type PushFoldData } from './pushfold-data';

export function makeFixture(ev: (hand: number, s: Situation) => number): PushFoldData {
  const data: PushFoldData = {
    version: 1,
    config: { seats: 8, ante: 1, minStack: 1, maxStack: 20, iterations: 0, maxExploitability: 0, maxHandRegret: 0 },
    openShove: {} as PushFoldData['openShove'],
    callVsShove: {} as PushFoldData['callVsShove'],
  };
  for (const shover of OPEN_POSITIONS) {
    data.openShove[shover] = [];
    for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
      const s: Situation = { kind: 'open', position: shover, stack };
      data.openShove[shover].push(Array.from({ length: HAND_COUNT }, (_, h) => ev(h, s)));
    }
    for (const caller of callerPositions(shover)) {
      const key = callKey(shover, caller);
      data.callVsShove[key] = [];
      for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
        const s: Situation = { kind: 'call', shover, position: caller, stack };
        data.callVsShove[key].push(Array.from({ length: HAND_COUNT }, (_, h) => ev(h, s)));
      }
    }
  }
  return data;
}
