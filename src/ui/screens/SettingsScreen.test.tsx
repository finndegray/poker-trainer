// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bounty from '../../review/fixtures/bounty.txt?raw';
import { memoryReviewBackend, tournamentKey } from '../../review/archive';
import { EXPORT_KEY, withArchive } from '../../review/export';
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

  it('exports the save as a dated JSON file', async () => {
    const { loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(() => loaded);
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

describe('SettingsScreen with the hand archive', () => {
  it('adds the archive to the export once hands are archived', async () => {
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(async () => {
      await loaded;
      await review.importText(bounty);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    const text = vi.mocked(downloadText).mock.calls[0][1];
    expect(JSON.parse(text)[EXPORT_KEY].hands).toHaveLength(1);
    expect(text.startsWith(serialize(emptyState()).slice(0, -1))).toBe(true);
  });

  it('merges the archive part of an imported file', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(() => loaded);
    const part = { reviewSchemaVersion: 1 as const, tournaments: [{ id: '318083464', name: 'Bounty Hunters $2.50', kind: 'normal' as const }], hands: [{ id: 'TM6532114653', tournamentId: '318083464', raw: bounty }] };
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(withArchive(serialize(emptyState()), part))] } });
    expect(await screen.findByText('Spielstand importiert. Hand-Archiv: 1 Hand ergänzt, 0 schon vorhanden.')).toBeTruthy();
    expect(review.getSnapshot().tournaments[0]).toMatchObject({ id: '318083464', kind: 'normal' });
  });

  it('imports nothing when the archive part is broken', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store, create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    const broken = serialize({ ...emptyState(), profile: { xp: 5, combo: 0, soundOn: true } }).slice(0, -1) + ',"reviewArchive":{"reviewSchemaVersion":1}}';
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(broken)] } });
    expect(await screen.findByText('Import fehlgeschlagen: Hand-Archiv in der Datei ist nicht lesbar')).toBeTruthy();
    expect(store.getSnapshot().save.profile.xp).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('says "Hände" for several hands', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(() => loaded);
    const hands = bounty.split(/\n(?=Poker Hand #)/);
    const raws = [hands[0], hands[0].replace(/TM6532114653/g, 'TM9999999991')];
    const part = { reviewSchemaVersion: 1 as const, tournaments: [{ id: '318083464', name: 'Bounty Hunters $2.50', kind: 'normal' as const }], hands: raws.map((raw, i) => ({ id: `h${i}`, tournamentId: '318083464', raw })) };
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(withArchive(serialize(emptyState()), part))] } });
    expect(await screen.findByText(/2 Hände ergänzt/)).toBeTruthy();
  });

  it('keeps the export enabled once the archive has loaded', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = memoryReviewBackend();
    const reviewBackend = { ...inner, keys: async () => { await gate; return inner.keys(); } };
    const { loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />, { reviewBackend });
    await act(async () => {
      release();
      await loaded;
    });
    expect((screen.getByRole('button', { name: 'Exportieren' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('exports the save alone while the archive is still loading', async () => {
    const gate = new Promise<void>(() => {});
    const inner = memoryReviewBackend();
    const reviewBackend = { ...inner, keys: async () => { await gate; return inner.keys(); } };
    renderWithStore(<SettingsScreen onBack={() => {}} />, { reviewBackend });
    const button = screen.getByRole('button', { name: 'Exportieren' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith(expect.any(String), serialize(emptyState())));
    expect(await screen.findByText('Export erstellt. Das Hand-Archiv wurde noch nicht geladen und fehlt darin.')).toBeTruthy();
  });

  it('reports unreadable archive entries left out of the export', async () => {
    const reviewBackend = memoryReviewBackend({ [tournamentKey('1')]: 'kaputt', [tournamentKey('2')]: 'kaputt' });
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />, { reviewBackend });
    await act(async () => {
      await loaded;
      await review.importText(bounty);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    expect(await screen.findByText('Export erstellt (2 unlesbare Archiv-Einträge nicht exportiert).')).toBeTruthy();
  });

  it('does not mention unreadable entries when there are none', async () => {
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(async () => {
      await loaded;
      await review.importText(bounty);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/unlesbar/)).toBeNull();
  });
});
