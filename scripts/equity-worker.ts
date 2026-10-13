import { parentPort, workerData } from 'node:worker_threads';
import { sampleClassEquity } from '../src/engine/equity';
import { mulberry32 } from '../src/engine/rng';

type Job = { pairs: Array<[number, number]>; samples: number; seed: number };
const job = workerData as Job;
const rng = mulberry32(job.seed);
const results: Array<[number, number, number]> = [];
for (const [i, j] of job.pairs) {
  results.push([i, j, sampleClassEquity(i, j, job.samples, rng)]);
  if (results.length % 50 === 0) parentPort?.postMessage({ progress: 50 });
}
parentPort?.postMessage({ results });
