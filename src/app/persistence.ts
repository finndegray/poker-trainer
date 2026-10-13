import type { SaveState } from '../storage/schema';
import { type KeyValueBackend, type LoadResult, indexedDbBackend, loadState, memoryBackend, saveState } from '../storage/store';
import { SaveQueue } from './save-queue';

export const WRITER_LOCK = 'poker-trainer-writer';

export type LockLike = {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void>): Promise<unknown>;
};
export type StorageMode = 'indexeddb' | 'memory';
export type PersistenceInfo = {
  mode: StorageMode;
  readOnly: boolean;
  otherTabActive: boolean;
  corruptBackup: { key: string; raw: string } | null;
};
export type Persistence = {
  initial: SaveState;
  info: PersistenceInfo;
  save(state: SaveState): void;
  flush(): Promise<void>;
};
export type PersistenceEnv = {
  createBackend: () => KeyValueBackend;
  locks?: LockLike;
  storage?: { persist?: () => Promise<boolean> };
  now: () => Date;
  onSaveError: (error: unknown) => void;
};

export function acquireWriterLock(locks?: LockLike): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    locks
      .request(WRITER_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return Promise.resolve();
        }
        resolve(true);
        // Keep the lock until the tab closes.
        return new Promise<void>(() => {});
      })
      .catch(() => resolve(true));
  });
}

async function loadWithFallback(env: PersistenceEnv): Promise<{ backend: KeyValueBackend; mode: StorageMode; loaded: LoadResult }> {
  try {
    const backend = env.createBackend();
    return { backend, mode: 'indexeddb', loaded: await loadState(backend, env.now()) };
  } catch {
    const backend = memoryBackend();
    return { backend, mode: 'memory', loaded: await loadState(backend, env.now()) };
  }
}

export async function openPersistence(env: PersistenceEnv): Promise<Persistence> {
  const { backend, mode, loaded } = await loadWithFallback(env);
  const hasLock = mode === 'memory' ? true : await acquireWriterLock(env.locks);
  try {
    await env.storage?.persist?.();
  } catch {
    // Persistence is a best-effort request; the app works without it.
  }
  const writable = !loaded.readOnly && hasLock;
  const queue = new SaveQueue<SaveState>((state) => saveState(backend, state, { readOnly: !writable }), env.onSaveError);
  return {
    initial: loaded.state,
    info: { mode, readOnly: loaded.readOnly, otherTabActive: !hasLock, corruptBackup: loaded.corruptBackup },
    save: (state) => {
      if (writable) queue.schedule(state);
    },
    flush: () => queue.flush(),
  };
}

export function browserEnv(onSaveError: (error: unknown) => void): PersistenceEnv {
  return {
    createBackend: () => indexedDbBackend(),
    locks: (navigator as Navigator & { locks?: LockLike }).locks,
    storage: navigator.storage,
    now: () => new Date(),
    onSaveError,
  };
}

export function installFlushOnHide(persistence: Pick<Persistence, 'flush'>, doc: Document, win: Window): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') void persistence.flush();
  };
  const onPageHide = () => {
    void persistence.flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  };
}
