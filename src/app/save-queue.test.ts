import { describe, expect, it } from 'vitest';
import { SaveQueue } from './save-queue';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe('SaveQueue', () => {
  it('writes the latest value and never two at once', async () => {
    const writes: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const queue = new SaveQueue<number>(async (v) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      writes.push(v);
      inFlight--;
    }, () => {});

    queue.schedule(1);
    queue.schedule(2);
    queue.schedule(3);
    await queue.flush();
    expect(writes).toEqual([1, 3]);
    expect(maxInFlight).toBe(1);

    queue.schedule(4);
    await queue.flush();
    expect(writes).toEqual([1, 3, 4]);
  });

  it('reports errors and keeps going', async () => {
    const errors: unknown[] = [];
    const writes: number[] = [];
    const queue = new SaveQueue<number>(async (v) => {
      if (v === 1) throw new Error('voll');
      writes.push(v);
    }, (e) => errors.push(e));
    queue.schedule(1);
    await queue.flush();
    queue.schedule(2);
    await queue.flush();
    expect(errors).toHaveLength(1);
    expect(writes).toEqual([2]);
  });

  it('flush resolves immediately when idle', async () => {
    const queue = new SaveQueue<number>(async () => {}, () => {});
    await expect(queue.flush()).resolves.toBeUndefined();
  });
});
