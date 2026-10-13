import { createStore, get, set } from 'idb-keyval';
import { MAX_DECISIONS, MAX_RUNS, SaveFormatError, deserialize, emptyState, serialize, type SaveState } from './schema';

export interface KeyValueBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export const SAVE_KEY = 'save';
export const BACKUP_PREFIX = 'corrupt-backup:';

export type LoadResult = { state: SaveState; corruptBackup: { key: string; raw: string } | null };

export async function loadState(backend: KeyValueBackend, now: Date): Promise<LoadResult> {
  const raw = await backend.get(SAVE_KEY);
  if (raw === undefined) return { state: emptyState(), corruptBackup: null };
  try {
    return { state: deserialize(raw), corruptBackup: null };
  } catch (error) {
    if (!(error instanceof SaveFormatError)) throw error;
    const key = `${BACKUP_PREFIX}${now.toISOString()}`;
    await backend.set(key, raw);
    return { state: emptyState(), corruptBackup: { key, raw } };
  }
}

export function trimState(state: SaveState): SaveState {
  return { ...state, decisions: state.decisions.slice(-MAX_DECISIONS), runs: state.runs.slice(-MAX_RUNS) };
}

export async function saveState(backend: KeyValueBackend, state: SaveState): Promise<void> {
  await backend.set(SAVE_KEY, serialize(trimState(state)));
}

export function memoryBackend(initial: Record<string, string> = {}): KeyValueBackend & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
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
  };
}
