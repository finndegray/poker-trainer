import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MAX_DECISIONS, emptyState, serialize, type SaveState } from './schema';
import { BACKUP_PREFIX, SAVE_KEY, indexedDbBackend, loadState, memoryBackend, saveState, type KeyValueBackend } from './store';

const now = new Date('2026-10-13T10:00:00Z');

describe('loadState / saveState', () => {
  it('starts empty without a saved state', async () => {
    expect(await loadState(memoryBackend(), now)).toEqual({ state: emptyState(), corruptBackup: null });
  });

  it('round-trips a saved state', async () => {
    const backend = memoryBackend();
    const state: SaveState = { ...emptyState(), profile: { xp: 900, combo: 2, soundOn: false } };
    await saveState(backend, state);
    expect((await loadState(backend, now)).state).toEqual(state);
  });

  it('backs up an unreadable state and does not overwrite it', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: '{kaputt' });
    const result = await loadState(backend, now);
    expect(result.state).toEqual(emptyState());
    expect(result.corruptBackup).toEqual({ key: `${BACKUP_PREFIX}2026-10-13T10:00:00.000Z`, raw: '{kaputt' });
    expect(backend.dump()[SAVE_KEY]).toBe('{kaputt');
    expect(backend.dump()[`${BACKUP_PREFIX}2026-10-13T10:00:00.000Z`]).toBe('{kaputt');
  });

  it('propagates backend failures', async () => {
    const broken: KeyValueBackend = {
      get: () => Promise.reject(new Error('disk')),
      set: () => Promise.resolve(),
    };
    await expect(loadState(broken, now)).rejects.toThrow('disk');
  });

  it('keeps only the newest decisions when saving', async () => {
    const backend = memoryBackend();
    const decisions = Array.from({ length: MAX_DECISIONS + 3 }, (_, i) => ({
      ts: i, dateKey: '2026-10-13', mode: 'training' as const,
      spot: { kind: 'open' as const, position: 'BTN' as const, stack: 10, hand: 0 },
      chosen: 'shove' as const, verdict: 'correct' as const, responseMs: 1000,
    }));
    await saveState(backend, { ...emptyState(), decisions });
    const loaded = (await loadState(backend, now)).state;
    expect(loaded.decisions).toHaveLength(MAX_DECISIONS);
    expect(loaded.decisions[0].ts).toBe(3);
  });
});

describe('indexedDbBackend', () => {
  it('stores and reads values', async () => {
    const backend = indexedDbBackend('poker-trainer-test');
    expect(await backend.get('missing')).toBeUndefined();
    await backend.set(SAVE_KEY, serialize(emptyState()));
    expect((await loadState(backend, now)).state).toEqual(emptyState());
  });
});
