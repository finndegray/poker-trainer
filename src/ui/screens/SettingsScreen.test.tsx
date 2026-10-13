// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyState, serialize } from '../../storage/schema';
import { downloadText } from '../download';
import { renderWithStore } from '../test-utils';
import { SettingsScreen } from './SettingsScreen';

vi.mock('../download', () => ({ downloadText: vi.fn() }));

afterEach(() => {
  vi.mocked(downloadText).mockReset();
  vi.restoreAllMocks();
});

const file = (text: string) => new File([text], 'spielstand.json', { type: 'application/json' });

describe('SettingsScreen', () => {
  it('toggles sounds', () => {
    const { store } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.click(screen.getByLabelText('Sounds abspielen'));
    expect(store.getSnapshot().save.profile.soundOn).toBe(false);
  });

  it('exports the save as a dated JSON file', () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringMatching(/^poker-trainer-spielstand-\d{4}-\d{2}-\d{2}\.json$/), serialize(emptyState()));
  });

  it('imports a save after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const imported = { ...emptyState(), profile: { xp: 900, combo: 0, soundOn: true } };
    const { store, create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(imported))] } });
    expect(await screen.findByText('Spielstand importiert.')).toBeTruthy();
    expect(create).toHaveBeenCalledWith(serialize(emptyState()));
    expect(store.getSnapshot().save.profile.xp).toBe(900);
  });

  it('reports an invalid file', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file('{kaputt')] } });
    expect(await screen.findByText(/^Import fehlgeschlagen: Spielstand nicht lesbar/)).toBeTruthy();
  });

  it('does nothing when the import is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(emptyState()))] } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
  });

  it('lists, downloads and deletes backups', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const key = 'corrupt-backup:2026-10-13T12:00:00.000Z';
    const { remove } = renderWithStore(<SettingsScreen onBack={() => {}} />, { backupKeys: [key] });
    expect(await screen.findByText(/^Sicherung vom /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith('poker-trainer-sicherung-2026-10-13.json', '{"gesichert":true}'));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(key));
  });

  it('shows an empty backup list and blocks import in a reading tab', async () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { info: { otherTabActive: true } });
    expect(await screen.findByText('Keine Sicherungen vorhanden.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Importieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.')).toBeTruthy();
  });
});
