// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { syncRetraining } from '../../game/retraining';
import { emptyState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { PlayScreen } from './PlayScreen';

const queued = syncRetraining(emptyState(), '318096259', [
  { key: 'TM6532734973:13', playedAt: '2026-10-12 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 } },
]);

describe('PlayScreen with the retraining queue', () => {
  it('marks the queued spot in the training with the date of the tournament', () => {
    const { store } = renderWithStore(<PlayScreen mode="training" onBack={() => {}} />, { initial: queued });
    expect(screen.queryByRole('note')).toBeNull();
    act(() => {
      for (let i = 0; i < 3; i++) store.nextTrainingSpot();
    });
    expect(screen.getByRole('note').textContent).toBe('Aus deinem Turnier vom 12.10.');
    expect(screen.getByText(/Du sitzt im HJ · 16 BB/)).toBeTruthy();
    act(() => store.nextTrainingSpot());
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('never shows queued spots in the daily challenge', () => {
    const { store } = renderWithStore(<PlayScreen mode="daily" onBack={() => {}} />, { initial: queued });
    for (let i = 0; i < 5; i++) {
      expect(screen.queryByRole('note')).toBeNull();
      act(() => {
        store.answer('fold');
        store.next();
      });
    }
  });
});
