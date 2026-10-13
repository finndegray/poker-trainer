// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { PersistenceInfo } from '../app/persistence';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState } from '../storage/schema';
import { App } from './App';
import { GameProvider } from './GameContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

function renderApp(info: Partial<PersistenceInfo> = {}) {
  const save = vi.fn();
  const store = createGameStore({
    data: makeFixture((h) => (84 - h) / 10),
    persistence: { initial: emptyState(), info: { ...baseInfo, ...info }, save },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  render(
    <GameProvider store={store}>
      <App />
    </GameProvider>,
  );
  return { store, save };
}

describe('App', () => {
  it('runs a training round from the home screen', () => {
    const { save } = renderApp();
    expect(screen.getByRole('heading', { name: 'Poker-Trainer' })).toBeTruthy();
    expect(screen.getAllByText('bald verfügbar')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fold/ }));
    expect(screen.getByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.queryByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Training starten' })).toBeTruthy();
  });

  it('plays with the keyboard', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeNull();
  });

  it('blocks training and explains a read-only save', () => {
    renderApp({ readOnly: true });
    expect(screen.getByText(/stammt aus einer neueren Version/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Training starten' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows storage notices', () => {
    renderApp({ mode: 'memory', otherTabActive: true, corruptBackup: { key: 'corrupt-backup:x', raw: '{kaputt' } });
    expect(screen.getByText(/keinen dauerhaften Speicher/)).toBeTruthy();
    expect(screen.getByText(/in einem anderen Tab geöffnet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicherung herunterladen' })).toBeTruthy();
  });
});
