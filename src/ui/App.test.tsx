// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
