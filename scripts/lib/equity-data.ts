import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAND_COUNT } from '../../src/engine/cards';

export type EquityFile = { samples: number; seed: number; equity: number[] };

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'equity.json');

export function loadEquity(): Float64Array {
  const data = JSON.parse(readFileSync(file, 'utf8')) as EquityFile;
  if (data.equity.length !== HAND_COUNT * HAND_COUNT) {
    throw new Error('equity.json hat die falsche Länge, bitte npm run data:equity erneut ausführen');
  }
  return Float64Array.from(data.equity);
}
