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

  it('reports a backup list that fails to load after a successful import', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await screen.findByText('Keine Sicherungen vorhanden.');
    vi.spyOn(store.getBackups(), 'list').mockRejectedValueOnce(new Error('IDB weg'));
    const imported = { ...emptyState(), profile: { xp: 900, combo: 0, soundOn: true } };
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(imported))] } });
    expect(await screen.findByText('Spielstand importiert. Die Liste der Sicherungen konnte nicht geladen werden.')).toBeTruthy();
    expect(store.getSnapshot().save.profile.xp).toBe(900);
  });

  it('reports a backup list that fails to load on opening', async () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { backups: { list: async () => Promise.reject(new Error('IDB weg')) } });
    expect(await screen.findByText('Sicherungen konnten nicht geladen werden.')).toBeTruthy();
  });

  it('reports a failed backup download', async () => {
    const key = 'corrupt-backup:2026-10-13T12:00:00.000Z';
    renderWithStore(<SettingsScreen onBack={() => {}} />, {
      backupKeys: [key],
      backups: { read: async () => Promise.reject(new Error('nicht lesbar')) },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Herunterladen' }));
    expect(await screen.findByText('Download fehlgeschlagen: nicht lesbar')).toBeTruthy();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('names a downloaded backup after its local date', async () => {
    const iso = '2026-10-13T23:30:00.000Z';
    renderWithStore(<SettingsScreen onBack={() => {}} />, { backupKeys: [`corrupt-backup:${iso}`] });
    fireEvent.click(await screen.findByRole('button', { name: 'Herunterladen' }));
    const local = new Date(iso);
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith(`poker-trainer-sicherung-${expected}.json`, '{"gesichert":true}'));
  });

  it('disables the sound switch in a reading tab', () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { info: { otherTabActive: true } });
    expect((screen.getByLabelText('Sounds abspielen') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows an empty backup list and blocks import in a reading tab', async () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { info: { otherTabActive: true } });
    expect(await screen.findByText('Keine Sicherungen vorhanden.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Importieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.')).toBeTruthy();
  });
});
