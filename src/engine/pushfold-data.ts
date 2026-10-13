import type { Position } from './positions';

export const MIN_STACK = 1;
export const MAX_STACK = 20;

export type PushFoldData = {
  version: 1;
  config: {
    seats: 8;
    ante: 1;
    minStack: 1;
    maxStack: 20;
    iterations: number;
    maxExploitability: number;
    maxHandRegret: number;
  };
  openShove: Record<string, number[][]>;
  callVsShove: Record<string, number[][]>;
};

export const callKey = (shover: Position, caller: Position): string => `${shover}>${caller}`;
