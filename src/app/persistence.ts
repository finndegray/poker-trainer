import type { SaveState } from '../storage/schema';
import {
  type KeyValueBackend,
  type LoadResult,
  deleteBackup,
  indexedDbBackend,
  listBackups,
  loadState,
  memoryBackend,
  readBackup,
  saveState,
  writeBackup,
} from '../storage/store';
import { SaveQueue } from './save-queue';

export const WRITER_LOCK = 'poker-trainer-writer';

const notWritable = (): Error => new Error('Dieser Tab darf gerade nicht speichern.');

export type LockLike = {
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<void>): Promise<unknown>;
};
export type StorageMode = 'indexeddb' | 'memory';
export type PersistenceInfo = {
  mode: StorageMode;
  readOnly: boolean;
  otherTabActive: boolean;
  corruptBackup: { key: string; raw: string } | null;
};
export type BackupApi = {
  list(): Promise<string[]>;
  read(key: string): Promise<string | undefined>;
  remove(key: string): Promise<void>;
  create(raw: string): Promise<string>;
};
export type Persistence = {
  initial: SaveState;
  info: PersistenceInfo;
  save(state: SaveState): void;
  flush(): Promise<void>;
  /** Called once this tab becomes the writer after another tab released the lock. */
  onWriterAcquired(listener: (fresh: SaveState) => void): () => void;
  /** Manual and automatic backups of the save, e.g. before an import. */
  backups: BackupApi;
};
export type PersistenceEnv = {
  createBackend: () => KeyValueBackend;
  locks?: LockLike;
  storage?: { persist?: () => Promise<boolean> };
  now: () => Date;
  onSaveError: (error: unknown) => void;
  /** Loading longer than this falls back to memory mode (default 5000 ms). */
  loadTimeoutMs?: number;
};

const DEFAULT_LOAD_TIMEOUT_MS = 5000;

export type WriterLock = { granted: boolean; release(): void };

const noLock = (granted: boolean): WriterLock => ({ granted, release: () => {} });

/** Without a working lock API the tab may write (fail open); the lock is held until `release()`. */
export function acquireWriterLock(locks?: LockLike): Promise<WriterLock> {
  if (!locks) return Promise.resolve(noLock(true));
  return new Promise<WriterLock>((resolve) => {
    try {
      locks
        .request(WRITER_LOCK, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(noLock(false));
            return Promise.resolve();
          }
          // Keep the lock until released (normally: until the tab closes).
          return new Promise<void>((release) => resolve({ granted: true, release: () => release() }));
        })
        .catch(() => resolve(noLock(true)));
    } catch {
      resolve(noLock(true));
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Laden dauerte länger als ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function openBackend(env: PersistenceEnv): Promise<{ backend: KeyValueBackend; mode: StorageMode; loaded: LoadResult; hasLock: boolean }> {
  let lock: WriterLock | null = null;
  try {
    const backend = env.createBackend();
    // Lock first, so we never work on a state loaded while another tab was still writing.
    lock = await acquireWriterLock(env.locks);
    const loaded = await withTimeout(loadState(backend, env.now()), env.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS);
    return { backend, mode: 'indexeddb', loaded, hasLock: lock.granted };
  } catch {
    // A memory-only tab never writes the shared state, so another tab may become the writer.
    lock?.release();
    const backend = memoryBackend();
    return { backend, mode: 'memory', loaded: await loadState(backend, env.now()), hasLock: true };
  }
}

export async function openPersistence(env: PersistenceEnv): Promise<Persistence> {
  const { backend, mode, loaded, hasLock } = await openBackend(env);
  // Best-effort and never blocks startup; the app works without it.
  void Promise.resolve()
    .then(() => env.storage?.persist?.())
    .catch(() => {});
  let writable = !loaded.readOnly && hasLock;
  const queue = new SaveQueue<SaveState>((state) => saveState(backend, state, { readOnly: !writable }), env.onSaveError);
  const writerListeners = new Set<(fresh: SaveState) => void>();
  let acquiredState: SaveState | null = null;

  if (!hasLock && env.locks)
    waitForWriterLock(env, backend, (fresh) => {
      writable = true;
      acquiredState = fresh;
      for (const listener of [...writerListeners]) listener(fresh);
    });

  return {
    initial: loaded.state,
    info: { mode, readOnly: loaded.readOnly, otherTabActive: !hasLock, corruptBackup: loaded.corruptBackup },
    save: (state) => {
      if (writable) queue.schedule(state);
    },
    flush: () => queue.flush(),
    backups: {
      list: () => listBackups(backend),
      read: (key) => readBackup(backend, key),
      remove: (key) => (writable ? deleteBackup(backend, key) : Promise.reject(notWritable())),
      create: (raw) => (writable ? writeBackup(backend, raw, env.now()) : Promise.reject(notWritable())),
    },
    onWriterAcquired(listener) {
      // A listener that subscribes after the hand-over still learns about it.
      if (acquiredState) listener(acquiredState);
      writerListeners.add(listener);
      return () => {
        writerListeners.delete(listener);
      };
    },
  };
}

/** Queues a normal (waiting) lock request; once granted, reloads the state and becomes the writer. */
function waitForWriterLock(
  env: PersistenceEnv,
  backend: KeyValueBackend,
  onAcquired: (fresh: SaveState) => void,
): void {
  const onGranted = async (lock: unknown): Promise<void> => {
    if (!lock) return;
    try {
      // The previous writer has flushed and closed; its state is the newest one.
      const fresh = await loadState(backend, env.now());
      // A save from a newer app version stays untouched; this tab keeps not writing.
      if (fresh.readOnly) return;
      onAcquired(fresh.state);
    } catch (error) {
      env.onSaveError(error);
      return;
    }
    // Keep the lock until the tab closes.
    await new Promise<void>(() => {});
  };
  try {
    void env.locks!.request(WRITER_LOCK, {}, onGranted).catch(() => {});
  } catch {
    // Without a working lock API this tab simply stays a reader.
  }
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
