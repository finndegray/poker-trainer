import type { PushFoldData } from '../engine/pushfold-data';
import { type HandAnalysis, analyzeHand } from './analysis';
import { type ParsedHand, parseHand } from './parse';

/** Rates hands; `onProgress` receives how many of them are done. Results come in the order of `hands`. */
export interface HandAnalyzer {
  analyze(hands: readonly ParsedHand[], onProgress?: (done: number) => void): Promise<HandAnalysis[]>;
}

/** Hands rated on the main thread between two pauses (fallback and tests). */
export const INLINE_CHUNK = 5;
/** The worker reports progress after this many hands. */
export const WORKER_PROGRESS_EVERY = 5;

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Main-thread analyzer: rates in small chunks and pauses in between, so the page can paint. */
export function createInlineAnalyzer(data: PushFoldData, pause: () => Promise<void> = nextTick): HandAnalyzer {
  return {
    async analyze(hands, onProgress) {
      const out: HandAnalysis[] = [];
      for (const [i, hand] of hands.entries()) {
        if (i % INLINE_CHUNK === 0) {
          onProgress?.(i);
          await pause();
        }
        out.push(analyzeHand(hand, data));
      }
      onProgress?.(hands.length);
      return out;
    },
  };
}

export type WorkerRequest = { type: 'init'; data: PushFoldData } | { type: 'analyze'; id: number; raws: string[] };
export type WorkerResponse =
  | { type: 'progress'; id: number; done: number }
  | { type: 'done'; id: number; analyses: HandAnalysis[] }
  | { type: 'error'; id: number; message: string };

/** The worker's logic without the worker: handles one request and answers through `post`. */
export function createWorkerHandler(post: (message: WorkerResponse) => void): (request: WorkerRequest) => void {
  let data: PushFoldData | null = null;
  return (request) => {
    if (request.type === 'init') {
      data = request.data;
      return;
    }
    try {
      if (!data) throw new Error('Push/Fold-Daten fehlen im Worker');
      const analyses: HandAnalysis[] = [];
      for (const [i, raw] of request.raws.entries()) {
        analyses.push(analyzeHand(parseHand(raw), data));
        if ((i + 1) % WORKER_PROGRESS_EVERY === 0) post({ type: 'progress', id: request.id, done: i + 1 });
      }
      post({ type: 'done', id: request.id, analyses });
    } catch (error) {
      post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  };
}

/** The part of a `Worker` the analyzer uses; tests pass a fake. */
export type WorkerPort = {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
};

type Job = {
  hands: readonly ParsedHand[];
  onProgress?: (done: number) => void;
  resolve: (analyses: HandAnalysis[]) => void;
  reject: (error: Error) => void;
};

/**
 * Rates hands in a Web Worker (one at a time, in order). The worker gets the push/fold data once and the raw hand
 * texts per job. When the worker cannot start or fails, this and every later job runs on `fallback` instead.
 */
export function createWorkerAnalyzer(data: PushFoldData, spawn: () => WorkerPort, fallback: HandAnalyzer): HandAnalyzer {
  let port: WorkerPort | null = null;
  let broken = false;
  let nextId = 1;
  const jobs = new Map<number, Job>();

  const giveUp = () => {
    broken = true;
    port?.terminate();
    port = null;
    const pending = [...jobs.values()];
    jobs.clear();
    for (const job of pending) fallback.analyze(job.hands, job.onProgress).then(job.resolve, job.reject);
  };

  const start = (): WorkerPort | null => {
    if (broken) return null;
    if (port) return port;
    try {
      port = spawn();
    } catch {
      broken = true;
      return null;
    }
    port.onmessage = ({ data: message }) => {
      const job = jobs.get(message.id);
      if (!job) return;
      if (message.type === 'progress') job.onProgress?.(message.done);
      else {
        jobs.delete(message.id);
        if (message.type === 'done') {
          job.onProgress?.(job.hands.length);
          job.resolve(message.analyses);
        } else job.reject(new Error(`Analyse fehlgeschlagen: ${message.message}`));
      }
    };
    port.onerror = giveUp;
    port.postMessage({ type: 'init', data });
    return port;
  };

  return {
    analyze(hands, onProgress) {
      if (hands.length === 0) return Promise.resolve([]);
      const worker = start();
      if (!worker) return fallback.analyze(hands, onProgress);
      return new Promise((resolve, reject) => {
        const id = nextId++;
        jobs.set(id, { hands, onProgress, resolve, reject });
        worker.postMessage({ type: 'analyze', id, raws: hands.map((h) => h.raw) });
      });
    },
  };
}
