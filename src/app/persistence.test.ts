// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { emptyState, serialize, type SaveState } from '../storage/schema';
import { SAVE_KEY, loadState, memoryBackend, type KeyValueBackend } from '../storage/store';
import { acquireWriterLock, installFlushOnHide, openPersistence, type LockLike, type PersistenceEnv } from './persistence';

const now = () => new Date('2026-10-13T12:00:00Z');
const env = (over: Partial<PersistenceEnv>): PersistenceEnv => ({
  createBackend: () => memoryBackend(),
  now,
  onSaveError: () => {},
  ...over,
});
const lockAvailable: LockLike = { request: (_n, _o, cb) => cb({}) };
const lockTaken: LockLike = { request: (_n, _o, cb) => cb(null) };
const withXp = (xp: number): SaveState => ({ ...emptyState(), profile: { xp, combo: 0, soundOn: true } });

describe('acquireWriterLock', () => {
  it('is granted without a lock API', async () => {
    expect(await acquireWriterLock(undefined)).toBe(true);
  });

  it('reports whether the lock was available', async () => {
    expect(await acquireWriterLock(lockAvailable)).toBe(true);
    expect(await acquireWriterLock(lockTaken)).toBe(false);
  });
});

describe('openPersistence', () => {
  it('loads the saved state and writes new states', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: serialize(withXp(40)) });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.initial.profile.xp).toBe(40);
    expect(p.info).toEqual({ mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null });
    p.save(withXp(55));
    await p.flush();
    expect((await loadState(backend, now())).state.profile.xp).toBe(55);
  });

  it('falls back to memory when the backend fails', async () => {
    const broken: KeyValueBackend = {
      get: () => Promise.reject(new Error('blockiert')),
      set: () => Promise.reject(new Error('blockiert')),
      keys: () => Promise.resolve([]),
      del: () => Promise.resolve(),
    };
    const p = await openPersistence(env({ createBackend: () => broken }));
    expect(p.info.mode).toBe('memory');
    expect(p.initial).toEqual(emptyState());
  });

  it('does not save when another tab holds the writer lock', async () => {
    const backend = memoryBackend();
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockTaken }));
    expect(p.info.otherTabActive).toBe(true);
    p.save(withXp(99));
    await p.flush();
    expect(backend.dump()[SAVE_KEY]).toBeUndefined();
  });

  it('is read-only for saves from a newer version', async () => {
    const raw = JSON.stringify({ ...emptyState(), schemaVersion: 2 });
    const backend = memoryBackend({ [SAVE_KEY]: raw });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.info.readOnly).toBe(true);
    p.save(withXp(1));
    await p.flush();
    expect(backend.dump()[SAVE_KEY]).toBe(raw);
  });

  it('passes on a corrupt backup', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: '{kaputt' });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.info.corruptBackup?.raw).toBe('{kaputt');
  });

  it('asks the browser to persist storage', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    await openPersistence(env({ storage: { persist } }));
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe('installFlushOnHide', () => {
  it('flushes on pagehide and when the page becomes hidden', () => {
    const flush = vi.fn(() => Promise.resolve());
    const remove = installFlushOnHide({ flush }, document, window);
    window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(2);
    remove();
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
