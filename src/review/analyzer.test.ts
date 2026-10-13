import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { analyzeHand } from './analysis';
import {
  INLINE_CHUNK,
  type WorkerPort,
  type WorkerRequest,
  type WorkerResponse,
  createInlineAnalyzer,
  createWorkerAnalyzer,
  createWorkerHandler,
} from './analyzer';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';

const data = getPushFoldData();
const hands = parseHistory(dailyClassic).hands;
const expected = hands.map((h) => analyzeHand(h, data));

/** A worker double that runs the real worker handler, answering asynchronously like a real worker. */
function fakeWorker(log: WorkerRequest['type'][]): WorkerPort {
  const port: WorkerPort = {
    onmessage: null,
    onerror: null,
    terminate: () => {},
    postMessage(request) {
      log.push(request.type);
      handle(structuredClone(request));
    },
  };
  const handle = createWorkerHandler((message) => setTimeout(() => port.onmessage?.({ data: structuredClone(message) } as MessageEvent<WorkerResponse>), 0));
  return port;
}

describe('inline analyzer', () => {
  it('rates like analyzeHand, pauses between chunks and reports progress', async () => {
    let pauses = 0;
    const done: number[] = [];
    const analyzer = createInlineAnalyzer(data, async () => {
      pauses++;
    });
    expect(await analyzer.analyze(hands, (n) => done.push(n))).toEqual(expected);
    expect(pauses).toBe(Math.ceil(hands.length / INLINE_CHUNK));
    expect(done.at(-1)).toBe(hands.length);
  });
});

describe('worker handler', () => {
  it('needs the push/fold data first and answers with the analyses', () => {
    const out: WorkerResponse[] = [];
    const handle = createWorkerHandler((m) => out.push(m));
    handle({ type: 'analyze', id: 1, raws: [hands[0].raw] });
    expect(out[0]).toMatchObject({ type: 'error', id: 1 });
    handle({ type: 'init', data });
    handle({ type: 'analyze', id: 2, raws: hands.map((h) => h.raw) });
    expect(out.at(-1)).toEqual({ type: 'done', id: 2, analyses: expected });
    expect(out).toContainEqual({ type: 'progress', id: 2, done: 5 });
  });
});

describe('worker analyzer', () => {
  it('sends the data once, then one job per call, and gives the same results as the main thread', async () => {
    const log: WorkerRequest['type'][] = [];
    const analyzer = createWorkerAnalyzer(data, () => fakeWorker(log), createInlineAnalyzer(data, async () => {}));
    const progress: number[] = [];
    const [a, b] = await Promise.all([analyzer.analyze(hands.slice(0, 3), (n) => progress.push(n)), analyzer.analyze(hands.slice(3))]);
    expect([...a, ...b]).toEqual(expected);
    expect(log).toEqual(['init', 'analyze', 'analyze']);
    expect(progress.at(-1)).toBe(3);
    expect(await analyzer.analyze([])).toEqual([]);
  });

  it('falls back to the main thread when the worker cannot start or fails', async () => {
    const fallback = createInlineAnalyzer(data, async () => {});
    const noWorker = createWorkerAnalyzer(data, () => {
      throw new Error('Worker nicht verfügbar');
    }, fallback);
    expect(await noWorker.analyze(hands)).toEqual(expected);

    let port: WorkerPort | null = null;
    const failing = createWorkerAnalyzer(
      data,
      () =>
        (port = { onmessage: null, onerror: null, terminate: () => {}, postMessage: () => {} }),
      fallback,
    );
    const pending = failing.analyze(hands);
    port!.onerror?.({} as ErrorEvent);
    expect(await pending).toEqual(expected);
    expect(await failing.analyze(hands.slice(0, 1))).toEqual(expected.slice(0, 1));
  });

  describe('worker boundary', () => {
    const fallback = () => createInlineAnalyzer(data, async () => {});
    const silent = (over: Partial<WorkerPort> = {}): WorkerPort => ({ onmessage: null, onerror: null, onmessageerror: null, terminate: () => {}, postMessage: () => {}, ...over });
    const reply = (port: WorkerPort, message: unknown) => port.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);

    it('falls back when posting the init message throws', async () => {
      const analyzer = createWorkerAnalyzer(data, () => silent({ postMessage: () => { throw new Error('DataCloneError'); } }), fallback());
      expect(await analyzer.analyze(hands)).toEqual(expected);
    });

    it('falls back when posting a job throws, also for jobs queued before', async () => {
      let calls = 0;
      const analyzer = createWorkerAnalyzer(
        data,
        () => silent({ postMessage: () => { if (++calls === 2) throw new Error('DataCloneError'); } }),
        fallback(),
      );
      expect(await analyzer.analyze(hands)).toEqual(expected);
      expect(await analyzer.analyze(hands.slice(0, 2))).toEqual(expected.slice(0, 2));
    });

    it('falls back on a message error', async () => {
      let port!: WorkerPort;
      const analyzer = createWorkerAnalyzer(data, () => (port = silent()), fallback());
      const pending = analyzer.analyze(hands);
      port.onmessageerror?.({} as MessageEvent);
      expect(await pending).toEqual(expected);
    });

    it('falls back on a done reply with the wrong number of analyses', async () => {
      let port!: WorkerPort;
      const analyzer = createWorkerAnalyzer(data, () => (port = silent()), fallback());
      const pending = analyzer.analyze(hands);
      reply(port, { type: 'done', id: 1, analyses: expected.slice(1) });
      expect(await pending).toEqual(expected);
    });

    it('ignores unknown ids and unknown or malformed messages', async () => {
      let port!: WorkerPort;
      const analyzer = createWorkerAnalyzer(data, () => (port = silent()), fallback());
      const pending = analyzer.analyze(hands.slice(0, 2));
      reply(port, { type: 'done', id: 99, analyses: [] });
      reply(port, { type: 'weird', id: 1 });
      reply(port, null);
      reply(port, { type: 'done', analyses: [] });
      reply(port, { type: 'done', id: 1, analyses: expected.slice(0, 2) });
      expect(await pending).toEqual(expected.slice(0, 2));
    });
  });
});
