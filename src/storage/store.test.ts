import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MAX_DECISIONS, SaveFormatError, emptyState, serialize, type SaveState } from './schema';
import {
  BACKUP_PREFIX, SAVE_KEY, deleteBackup, indexedDbBackend, listBackups, loadState, memoryBackend, readBackup, saveState,
  type KeyValueBackend,
} from './store';

const now = new Date('2026-10-13T10:00:00Z');

describe('loadState / saveState', () => {
  it('starts empty without a saved state', async () => {
    expect(await loadState(memoryBackend(), now)).toEqual({ state: emptyState(), corruptBackup: null, readOnly: false });
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
      keys: () => Promise.resolve([]),
      del: () => Promise.resolve(),
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

describe('saveState safety', () => {
  it('rejects a state that cannot be read back and keeps the previous save', async () => {
    const previous = serialize({ ...emptyState(), profile: { xp: 50, combo: 0, soundOn: true } });
    const backend = memoryBackend({ [SAVE_KEY]: previous });
    const broken: SaveState = { ...emptyState(), profile: { xp: Number.NaN, combo: 0, soundOn: true } };
    await expect(saveState(backend, broken)).rejects.toThrow(SaveFormatError);
    expect(backend.dump()[SAVE_KEY]).toBe(previous);
  });
});

describe('newer schema version', () => {
  const newer = JSON.stringify({ ...emptyState(), schemaVersion: 2 });

  it('loads read-only without backing up', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: newer });
    expect(await loadState(backend, now)).toEqual({ state: emptyState(), corruptBackup: null, readOnly: true });
    expect(backend.dump()).toEqual({ [SAVE_KEY]: newer });
  });

  it('refuses to save in read-only mode', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: newer });
    await expect(saveState(backend, emptyState(), { readOnly: true })).rejects.toThrow(/neueren Version/);
    expect(backend.dump()[SAVE_KEY]).toBe(newer);
  });

  it('marks corrupt and normal loads as writable', async () => {
    expect((await loadState(memoryBackend({ [SAVE_KEY]: '{kaputt' }), now)).readOnly).toBe(false);
    expect((await loadState(memoryBackend({ [SAVE_KEY]: serialize(emptyState()) }), now)).readOnly).toBe(false);
  });
});

describe('backups', () => {
  it('lists, reads and deletes backups', async () => {
    const b1 = `${BACKUP_PREFIX}2026-10-13T10:00:00.000Z`;
    const b0 = `${BACKUP_PREFIX}2026-10-12T10:00:00.000Z`;
    const backend = memoryBackend({ [SAVE_KEY]: 'x', [b1]: 'eins', [b0]: 'null' });
    expect(await listBackups(backend)).toEqual([b0, b1]);
    expect(await readBackup(backend, b1)).toBe('eins');
    expect(await readBackup(backend, `${BACKUP_PREFIX}fehlt`)).toBeUndefined();
    await deleteBackup(backend, b0);
    expect(await listBackups(backend)).toEqual([b1]);
    await expect(deleteBackup(backend, SAVE_KEY)).rejects.toThrow(/kein Backup/);
    expect(backend.dump()[SAVE_KEY]).toBe('x');
  });
});

describe('indexedDbBackend keys / del', () => {
  it('lists and deletes keys', async () => {
    const backend = indexedDbBackend('poker-trainer-keys-test');
    await backend.set('a', '1');
    await backend.set(`${BACKUP_PREFIX}x`, '2');
    expect([...(await backend.keys())].sort()).toEqual(['a', `${BACKUP_PREFIX}x`]);
    expect(await listBackups(backend)).toEqual([`${BACKUP_PREFIX}x`]);
    await backend.del('a');
    expect(await backend.get('a')).toBeUndefined();
    expect(await backend.keys()).toEqual([`${BACKUP_PREFIX}x`]);
  });
});
