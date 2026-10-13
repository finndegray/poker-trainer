import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { HAND_COUNT } from '../src/engine/cards';
import { assertKnownArgs, numberArg, parseArgs } from './lib/args';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
assertKnownArgs(args, ['samples', 'seed']);
const samples = numberArg(args, 'samples', 100_000, { integer: true, min: 1000 });
const seed = numberArg(args, 'seed', 20261013, { integer: true });
const workers = Math.max(1, availableParallelism() - 1);

const pairs: Array<[number, number]> = [];
for (let i = 0; i < HAND_COUNT; i++) for (let j = i + 1; j < HAND_COUNT; j++) pairs.push([i, j]);

const chunks: Array<Array<[number, number]>> = Array.from({ length: workers }, () => []);
pairs.forEach((p, k) => chunks[k % workers].push(p));

// Diagonal stays 0.5: identical classes are symmetric.
const equity = new Array<number>(HAND_COUNT * HAND_COUNT).fill(0.5);
let finished = 0;
const started = Date.now();

console.log(`Equity: ${pairs.length} Paare, ${samples} Samples, ${workers} Worker`);

await Promise.all(
  chunks.map(
    (chunk, w) =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL('./equity-worker.ts', import.meta.url), {
          workerData: { pairs: chunk, samples, seed: seed + w },
          execArgv: ['--import', 'tsx'],
        });
        worker.on('message', (msg: { progress?: number; results?: Array<[number, number, number]> }) => {
          if (msg.progress) {
            finished += msg.progress;
            const pct = ((finished / pairs.length) * 100).toFixed(1);
            const min = ((Date.now() - started) / 60_000).toFixed(1);
            process.stdout.write(`\r${pct} % nach ${min} min   `);
          }
          if (msg.results) {
            for (const [i, j, e] of msg.results) {
              equity[i * HAND_COUNT + j] = e;
              equity[j * HAND_COUNT + i] = 1 - e;
            }
            resolve();
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Equity-Worker ${w} wurde mit Exit-Code ${code} beendet`));
        });
      }),
  ),
);

const outDir = join(here, 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'equity.json'),
  JSON.stringify({ samples, seed, equity: equity.map((e) => Math.round(e * 10_000) / 10_000) }),
);
console.log('\nFertig: scripts/data/equity.json');
