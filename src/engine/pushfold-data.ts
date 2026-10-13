import { HAND_COUNT } from './cards';
import { OPEN_POSITIONS, type OpenPosition, type Position, callerPositions } from './positions';

export const MIN_STACK = 1;
export const MAX_STACK = 20;

export type CallKey = `${Position}>${Position}`;

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
  openShove: Record<OpenPosition, number[][]>;
  callVsShove: Record<CallKey, number[][]>;
};

export const callKey = (shover: Position, caller: Position): CallKey => `${shover}>${caller}`;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function checkTable(table: unknown, name: string): void {
  const rows = MAX_STACK - MIN_STACK + 1;
  if (!Array.isArray(table) || table.length !== rows) {
    throw new Error(`Push-Fold-Daten: ${name} braucht ${rows} Stack-Zeilen`);
  }
  table.forEach((row: unknown, i) => {
    if (!Array.isArray(row) || row.length !== HAND_COUNT) {
      throw new Error(`Push-Fold-Daten: ${name}, Stack ${i + MIN_STACK}: ${HAND_COUNT} Werte erwartet`);
    }
    row.forEach((v: unknown, h) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`Push-Fold-Daten: ${name}, Stack ${i + MIN_STACK}, Hand ${h}: keine endliche Zahl`);
      }
    });
  });
}

export function parsePushFoldData(raw: unknown): PushFoldData {
  if (!isRecord(raw)) throw new Error('Push-Fold-Daten: Objekt erwartet');
  if (raw.version !== 1) throw new Error(`Push-Fold-Daten: Version ${String(raw.version)} wird nicht unterstützt`);
  const config = raw.config;
  if (!isRecord(config)) throw new Error('Push-Fold-Daten: config fehlt');
  for (const field of ['seats', 'ante', 'minStack', 'maxStack', 'iterations', 'maxExploitability', 'maxHandRegret']) {
    const v = config[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`Push-Fold-Daten: config.${field} fehlt oder ist keine Zahl`);
    }
  }
  const { openShove, callVsShove } = raw;
  if (!isRecord(openShove)) throw new Error('Push-Fold-Daten: openShove fehlt');
  if (!isRecord(callVsShove)) throw new Error('Push-Fold-Daten: callVsShove fehlt');

  for (const key of Object.keys(openShove)) {
    if (!(OPEN_POSITIONS as readonly string[]).includes(key)) {
      throw new Error(`Push-Fold-Daten: unerwartete Position in openShove: ${key}`);
    }
  }
  const expectedCalls = new Set<string>();
  for (const shover of OPEN_POSITIONS) {
    checkTable(openShove[shover], `openShove.${shover}`);
    for (const caller of callerPositions(shover)) {
      const key = callKey(shover, caller);
      expectedCalls.add(key);
      checkTable(callVsShove[key], `callVsShove.${key}`);
    }
  }
  for (const key of Object.keys(callVsShove)) {
    if (!expectedCalls.has(key)) throw new Error(`Push-Fold-Daten: unerwarteter Call-Schlüssel ${key}`);
  }
  return raw as unknown as PushFoldData;
}
