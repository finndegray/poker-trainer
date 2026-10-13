import { type WorkerRequest, type WorkerResponse, createWorkerHandler } from './analyzer';

// Thin adapter: all logic lives in createWorkerHandler, which the tests run without a worker.
const scope = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
const handle = createWorkerHandler((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
