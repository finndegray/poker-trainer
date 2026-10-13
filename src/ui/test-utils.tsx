import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { BackupApi, PersistenceInfo } from '../app/persistence';
import { createReviewStore, retrainingSinkOf } from '../app/review-store';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { type ReviewBackend, memoryReviewBackend } from '../review/archive';
import { emptyState, type SaveState } from '../storage/schema';
import { GameProvider } from './GameContext';
import { ReviewProvider } from './ReviewContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

export function renderWithStore(
  ui: ReactElement,
  options: {
    initial?: SaveState;
    info?: Partial<PersistenceInfo>;
    backupKeys?: string[];
    backups?: Partial<BackupApi>;
    reviewBackend?: ReviewBackend;
  } = {},
) {
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:2026-10-13T16:00:00.000Z');
  const remove = vi.fn(async () => {});
  const data = makeFixture((h) => (84 - h) / 10);
  const info = { ...baseInfo, ...options.info };
  const store = createGameStore({
    data,
    persistence: {
      initial: options.initial ?? emptyState(),
      info,
      save,
      backups: {
        list: async () => options.backupKeys ?? [],
        read: async () => '{"gesichert":true}',
        remove,
        create,
        ...options.backups,
      },
    },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  const reviewBackend = options.reviewBackend ?? memoryReviewBackend();
  const review = createReviewStore({
    backend: reviewBackend,
    data,
    canWrite: () => !info.readOnly && !info.otherTabActive,
    readOnly: info.readOnly,
    pause: async () => {},
    retraining: retrainingSinkOf(store),
  });
  const loaded = review.load();
  const result = render(
    <GameProvider store={store}>
      <ReviewProvider store={review}>{ui}</ReviewProvider>
    </GameProvider>,
  );
  return { ...result, store, save, create, remove, data, review, reviewBackend, loaded };
}
