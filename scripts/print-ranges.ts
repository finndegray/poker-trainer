import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COMBOS } from '../src/engine/cards';
import type { PushFoldData } from '../src/engine/pushfold-data';

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/data/pushfold.json', import.meta.url)), 'utf8'),
) as PushFoldData;

for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
  const cells = [5, 10, 15, 20].map((s) => {
    const w = data.openShove[p][s - 1].reduce((a, ev, h) => a + (ev > 0 ? COMBOS[h].length : 0), 0) / 1326;
    return `${s} BB: ${(w * 100).toFixed(1)} %`;
  });
  console.log(`${p.padEnd(4)} ${cells.join(' | ')}`);
}
