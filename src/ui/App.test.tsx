// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { aggressiveAction, evOf } from '../engine/pushfold';
import { emptyState } from '../storage/schema';
import { App } from './App';
import { renderWithStore } from './test-utils';

const verdict = /^(Richtig|Falsch|Knapp – beides okay)$/;

describe('App', () => {
  it('runs a training round from the home screen', () => {
    const { save } = renderWithStore(<App />);
    expect(screen.getByRole('heading', { name: 'Poker-Trainer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));
    expect(screen.getByRole('heading', { name: verdict })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.queryByRole('heading', { name: verdict })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Training starten' })).toBeTruthy();
  });

  it('plays with the keyboard', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: verdict })).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('heading', { name: verdict })).toBeNull();
  });

  it('plays the daily challenge to the end and shows the result on the home screen', () => {
    renderWithStore(<App />);
    expect(screen.getByText('20 Spots – heute noch offen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Daily spielen' }));
    expect(screen.getByText(/^Daily Challenge · Spot 1\/20 · 0 richtig$/)).toBeTruthy();
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(window, { key: 'f' });
      fireEvent.keyDown(window, { key: ' ' });
    }
    expect(screen.getByRole('heading', { name: 'Daily Challenge geschafft' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zum Menü' }));
    expect(screen.getByText(/^Heute erledigt: \d+\/20$/)).toBeTruthy();
  });

  it('starts and continues an endphase run', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run starten' }));
    expect(screen.getByText(/^Level 1\/8 · 20 BB · Spot 1\/5$/)).toBeTruthy();
    expect(screen.getByLabelText('Leben: 3 von 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByText('Run läuft – Level 1 von 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run fortsetzen' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
  });

  it('opens statistics and settings', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Statistik ansehen' }));
    expect(screen.getByText(/Noch keine Entscheidungen/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(screen.getByLabelText('Sounds abspielen')).toBeTruthy();
  });

  it('blocks playing and explains a read-only save', () => {
    renderWithStore(<App />, { info: { readOnly: true } });
    expect(screen.getByText(/stammt aus einer neueren Version/)).toBeTruthy();
    for (const name of ['Training starten', 'Daily spielen', 'Run starten']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows storage notices', () => {
    renderWithStore(<App />, { info: { mode: 'memory', otherTabActive: true, corruptBackup: { key: 'corrupt-backup:x', raw: '{kaputt' } } });
    expect(screen.getByText(/keinen dauerhaften Speicher/)).toBeTruthy();
    expect(screen.getByText(/in einem anderen Tab geöffnet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicherung herunterladen' })).toBeTruthy();
  });
  it('keeps an unanswered spot when coming back from the menu', () => {
    const { store } = renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    const spot = store.getSnapshot().current!.spot;
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(store.getSnapshot().current!.spot).toBe(spot);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
  });

  it('deals a new spot and confirms when this tab becomes the writer during training', () => {
    const { store } = renderWithStore(<App />, { info: { otherTabActive: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));
    act(() => store.adoptSavedState(emptyState()));
    expect(screen.getByText(/Ab jetzt speichert dieser Tab/)).toBeTruthy();
    expect(screen.queryByText(/in einem anderen Tab geöffnet/)).toBeNull();
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText(/Ab jetzt speichert dieser Tab/)).toBeNull();
  });

  it('deals a new daily spot when this tab becomes the writer during the daily', () => {
    const { store } = renderWithStore(<App />, { info: { otherTabActive: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Daily spielen' }));
    fireEvent.keyDown(window, { key: 'f' });
    act(() => store.adoptSavedState(emptyState()));
    expect(screen.getByText(/Ab jetzt speichert dieser Tab/)).toBeTruthy();
    expect(screen.getByText(/^Daily Challenge · Spot 1\/20/)).toBeTruthy();
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
  });

  it('passes the update handler to the notice', () => {
    const onApplyUpdate = vi.fn(() => Promise.resolve());
    const { store } = renderWithStore(<App onApplyUpdate={onApplyUpdate} />);
    act(() => store.setUpdateAvailable());
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));
    expect(onApplyUpdate).toHaveBeenCalledOnce();
  });

  it('starts a new run from the home screen after a finished run', () => {
    const { store, data } = renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run starten' }));
    for (let i = 0; i < 40 && !screen.queryByRole('heading', { name: 'Ausgeschieden' }); i++) {
      const spot = store.getSnapshot().current!.spot;
      const wrong = evOf(data, spot) > 0 ? 'fold' : aggressiveAction(spot);
      act(() => {
        store.answer(wrong);
        store.next();
      });
    }
    expect(screen.getByRole('heading', { name: 'Ausgeschieden' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zum Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run starten' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByText(/^Level 1\/8 · 20 BB · Spot 1\/5$/)).toBeTruthy();
    expect(screen.getByLabelText('Leben: 3 von 3')).toBeTruthy();
  });
});
