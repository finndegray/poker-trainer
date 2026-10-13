import { createStore, del, get, keys, set } from 'idb-keyval';
import { MAX_DECISIONS, MAX_RUNS, SaveFormatError, deserialize, emptyState, serialize, type SaveState } from './schema';

export interface KeyValueBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  keys(): Promise<string[]>;
  del(key: string): Promise<void>;
}

export const SAVE_KEY = 'save';
export const BACKUP_PREFIX = 'corrupt-backup:';

export type LoadResult = {
  state: SaveState;
  corruptBackup: { key: string; raw: string } | null;
  // True when the save comes from a newer app version: the UI must not save over it.
  readOnly: boolean;
};
export type SaveOptions = { readOnly?: boolean };

export async function loadState(backend: KeyValueBackend, now: Date): Promise<LoadResult> {
  const raw = await backend.get(SAVE_KEY);
  if (raw === undefined) return { state: emptyState(), corruptBackup: null, readOnly: false };
  try {
    return { state: deserialize(raw), corruptBackup: null, readOnly: false };
  } catch (error) {
    if (!(error instanceof SaveFormatError)) throw error;
    if (error.code === 'newer-version') return { state: emptyState(), corruptBackup: null, readOnly: true };
    const key = `${BACKUP_PREFIX}${now.toISOString()}`;
    await backend.set(key, raw);
    return { state: emptyState(), corruptBackup: { key, raw }, readOnly: false };
  }
}

export function trimState(state: SaveState): SaveState {
  return { ...state, decisions: state.decisions.slice(-MAX_DECISIONS), runs: state.runs.slice(-MAX_RUNS) };
}

export async function saveState(backend: KeyValueBackend, state: SaveState, options: SaveOptions = {}): Promise<void> {
  if (options.readOnly) {
    throw new Error('Spielstand stammt aus einer neueren Version – bitte die App aktualisieren');
  }
  const text = serialize(trimState(state));
  // Never persist what cannot be read back: a failed round-trip throws before anything is written.
  deserialize(text);
  await backend.set(SAVE_KEY, text);
}

export async function listBackups(backend: KeyValueBackend): Promise<string[]> {
  return (await backend.keys()).filter((key) => key.startsWith(BACKUP_PREFIX)).sort();
}

export const readBackup = (backend: KeyValueBackend, key: string): Promise<string | undefined> => backend.get(key);

export async function deleteBackup(backend: KeyValueBackend, key: string): Promise<void> {
  if (!key.startsWith(BACKUP_PREFIX)) throw new Error(`Schlüssel ${key} ist kein Backup`);
  await backend.del(key);
}

export function memoryBackend(initial: Record<string, string> = {}): KeyValueBackend & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...data.keys()]),
    del: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
    dump: () => Object.fromEntries(data),
  };
}

export function indexedDbBackend(dbName = 'poker-trainer'): KeyValueBackend {
  const store = createStore(dbName, 'kv');
  return {
    get: (key) => get<string>(key, store),
    set: (key, value) => set(key, value, store),
    keys: async () => (await keys(store)).map(String),
    del: (key) => del(key, store),
  };
}
