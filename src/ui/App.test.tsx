// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { PersistenceInfo } from '../app/persistence';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState } from '../storage/schema';
import { App } from './App';
import { GameProvider } from './GameContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

function renderApp(info: Partial<PersistenceInfo> = {}, onApplyUpdate?: () => Promise<void>) {
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
      <App onApplyUpdate={onApplyUpdate} />
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
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows storage notices', () => {
    renderApp({ mode: 'memory', otherTabActive: true, corruptBackup: { key: 'corrupt-backup:x', raw: '{kaputt' } });
    expect(screen.getByText(/keinen dauerhaften Speicher/)).toBeTruthy();
    expect(screen.getByText(/in einem anderen Tab geöffnet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicherung herunterladen' })).toBeTruthy();
  });

  it('keeps an unanswered spot when coming back from the menu', () => {
    const { store } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    const spot = store.getSnapshot().current!.spot;
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(store.getSnapshot().current!.spot).toBe(spot);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
  });

  it('deals a new spot and confirms when this tab becomes the writer during training', () => {
    const { store } = renderApp({ otherTabActive: true });
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));
    act(() => store.adoptSavedState(emptyState()));
    expect(screen.getByText(/Ab jetzt speichert dieser Tab/)).toBeTruthy();
    expect(screen.queryByText(/in einem anderen Tab geöffnet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText(/Ab jetzt speichert dieser Tab/)).toBeNull();
  });

  it('passes the update handler to the notice', () => {
    const onApplyUpdate = vi.fn(() => Promise.resolve());
    const { store } = renderApp({}, onApplyUpdate);
    act(() => store.setUpdateAvailable());
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));
    expect(onApplyUpdate).toHaveBeenCalledOnce();
  });
});
