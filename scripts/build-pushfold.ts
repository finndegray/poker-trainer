import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatMatrix } from '../src/engine/cards';
import { OPEN_POSITIONS, callerPositions, seatOf } from '../src/engine/positions';
import { MAX_STACK, MIN_STACK, callKey, type PushFoldData } from '../src/engine/pushfold-data';
import { parseArgs } from './lib/args';
import { loadEquity } from './lib/equity-data';
import { solveSpot } from './lib/nash';

const MAX_EXPLOITABILITY = 0.05;
const MAX_HAND_REGRET = 0.1;
const args = parseArgs(process.argv.slice(2));
const iterations = Number(args.iterations ?? 500);

const equity = loadEquity();
const compat = compatMatrix();
const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

const data: PushFoldData = {
  version: 1,
  config: { seats: 8, ante: 1, minStack: 1, maxStack: 20, iterations, maxExploitability: 0, maxHandRegret: 0 },
  openShove: {},
  callVsShove: {},
};

for (const shover of OPEN_POSITIONS) {
  data.openShove[shover] = [];
  const callers = callerPositions(shover);
  for (const caller of callers) data.callVsShove[callKey(shover, caller)] = [];

  for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
    const r = solveSpot({ equity, compat, stack, shoverSeat: seatOf(shover), iterations });
    if (r.exploitability > MAX_EXPLOITABILITY) {
      throw new Error(
        `${shover} ${stack} BB: Exploitability ${r.exploitability.toFixed(3)} BB über ${MAX_EXPLOITABILITY}. Mehr --iterations verwenden.`,
      );
    }
    if (r.maxHandRegret >= MAX_HAND_REGRET) {
      throw new Error(
        `${shover} ${stack} BB: Einzelhand-Regret ${r.maxHandRegret.toFixed(3)} BB über ${MAX_HAND_REGRET}. Mehr --iterations verwenden.`,
      );
    }
    data.config.maxExploitability = Math.max(data.config.maxExploitability, round3(r.exploitability));
    data.config.maxHandRegret = Math.max(data.config.maxHandRegret, round3(r.maxHandRegret));
    data.openShove[shover].push(Array.from(r.shoveEv, round2));
    callers.forEach((caller, k) => data.callVsShove[callKey(shover, caller)].push(Array.from(r.callEv[k], round2)));
  }
  console.log(`${shover}: fertig`);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'pushfold.json'), JSON.stringify(data));
console.log(
  `Fertig: src/data/pushfold.json (max. Exploitability ${data.config.maxExploitability} BB, max. Einzelhand-Regret ${data.config.maxHandRegret} BB)`,
);
