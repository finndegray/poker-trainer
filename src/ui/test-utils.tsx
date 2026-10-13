import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { PersistenceInfo } from '../app/persistence';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState, type SaveState } from '../storage/schema';
import { GameProvider } from './GameContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

export function renderWithStore(
  ui: ReactElement,
  options: { initial?: SaveState; info?: Partial<PersistenceInfo>; backupKeys?: string[] } = {},
) {
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:2026-10-13T16:00:00.000Z');
  const remove = vi.fn(async () => {});
  const data = makeFixture((h) => (84 - h) / 10);
  const store = createGameStore({
    data,
    persistence: {
      initial: options.initial ?? emptyState(),
      info: { ...baseInfo, ...options.info },
      save,
      backups: {
        list: async () => options.backupKeys ?? [],
        read: async () => '{"gesichert":true}',
        remove,
        create,
      },
    },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  const result = render(<GameProvider store={store}>{ui}</GameProvider>);
  return { ...result, store, save, create, remove, data };
}
