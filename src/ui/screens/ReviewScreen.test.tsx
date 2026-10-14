// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bounty from '../../review/fixtures/bounty.txt?raw';
import dailyClassic from '../../review/fixtures/daily-classic.txt?raw';
import steps from '../../review/fixtures/step-satellites.txt?raw';
import { LOCK_OTHER_TAB } from '../../app/review-store';
import { TEST_PLAYED_AT, sevenTwoOpen } from '../../situation/test-situations';
import { situationText } from '../../situation/text';
import { renderWithStore } from '../test-utils';
import { ReviewScreen } from './ReviewScreen';

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => new Date(2026, 9, 13, 18, 0);

async function withHands(text = dailyClassic) {
  const utils = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
  await act(async () => {
    await utils.loaded;
    await utils.review.importText(text);
  });
  return utils;
}

async function openTournament(name: string, index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name })[index]);
  await screen.findByRole('heading', { name });
}

describe('ReviewScreen overview and import', () => {
  it('starts empty and imports pasted hands with a balance', async () => {
    renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    expect(await screen.findByText('Noch keine Hände importiert.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    fireEvent.change(screen.getByLabelText('Hände einfügen'), { target: { value: `${dailyClassic}\n\nkein Pokertext` } });
    fireEvent.click(screen.getByRole('button', { name: 'Eingefügte Hände importieren' }));
    const balance = await screen.findByRole('region', { name: 'Bilanz' });
    expect(within(balance).getByText('Importiert: 6 · Schon vorhanden: 0 · Übersprungen: 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zur Übersicht' }));
    const row = screen.getByRole('row', { name: /Daily Classic \$1/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['13.10.2026', 'Normal', '6', '3', '0', '50']);
    expect(screen.getByRole('img', { name: 'Fehler pro 100 Hände der letzten 8 Wochen' })).toBeTruthy();
  });

  it('shows a dash for postflop errors of a tournament that still waits for the new rating', async () => {
    const { memoryReviewBackend } = await import('../../review/archive');
    const backend = memoryReviewBackend();
    const first = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { reviewBackend: backend });
    await act(async () => {
      await first.loaded;
      await first.review.importText(bounty);
    });
    first.unmount();
    // The record as Plan 7 wrote it: no analysis version, so its summary has no postflop rating yet.
    const key = 'tournament:318083464';
    const { analysisVersion: _, ...plan7 } = JSON.parse(backend.dump()[key]);
    await backend.setMany([[key, JSON.stringify(plan7)]]);
    const second = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { reviewBackend: backend, info: { otherTabActive: true } });
    await act(() => second.loaded);
    const row = screen.getByRole('row', { name: /Bounty Hunters/ });
    expect(within(row).getAllByRole('cell')[4].textContent).toBe('–');
    expect(within(row).getAllByRole('cell')[4].getAttribute('title')).toBe('Wird neu bewertet, sobald du das Turnier öffnest');
  });

  it('imports files and lists skipped files with their reason', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    const files = [new File([bounty], 'bounty.txt', { type: 'text/plain' }), new File(['x'], 'bild.png')];
    fireEvent.change(screen.getByLabelText('Hand-Historien'), { target: { files } });
    expect(await screen.findByText('Importiert: 1 · Schon vorhanden: 0 · Übersprungen: 1')).toBeTruthy();
    expect(screen.getByText('Dateityp nicht unterstützt (nur .txt und .zip): 1')).toBeTruthy();
  });

  it('accepts files dropped onto the drop zone', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    const zone = screen.getByText(/Am PC auch per Drag & Drop/).parentElement!;
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('review-drop--active');
    fireEvent.drop(zone, { dataTransfer: { files: [new File([bounty], 'bounty.txt')] } });
    expect(await screen.findByText('Importiert: 1 · Schon vorhanden: 0 · Übersprungen: 0')).toBeTruthy();
  });

  it('blocks the import in read-only mode but still shows the archive', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { info: { readOnly: true } });
    await act(() => loaded);
    expect((screen.getByRole('button', { name: 'Hände importieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.')).toBeTruthy();
  });

  it('reports unreadable archive entries', async () => {
    const { memoryReviewBackend } = await import('../../review/archive');
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, {
      reviewBackend: memoryReviewBackend({ 'tournament:1': 'kaputt' }),
    });
    await act(() => loaded);
    expect(screen.getByRole('alert').textContent).toBe('1 Eintrag im Hand-Archiv ist nicht lesbar und wurde übersprungen (nicht gelöscht).');
  });

  it('shows per-tournament write refusals and renders skip reasons as plain text', async () => {
    const { loaded, review } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    vi.spyOn(review, 'importText').mockResolvedValue({
      imported: 0,
      duplicates: 0,
      skipped: [{ reason: '<b>fett</b>', count: 1 }],
      tournaments: 0,
      failures: ['Turnier „X“ konnte nicht gespeichert werden'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    fireEvent.change(screen.getByLabelText('Hände einfügen'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eingefügte Hände importieren' }));
    expect(await screen.findByText('Turnier „X“ konnte nicht gespeichert werden')).toBeTruthy();
    expect(screen.getByText('<b>fett</b>: 1')).toBeTruthy();
  });
});

describe('ReviewScreen tournament', () => {
  it('lists the hands worst first and filters them', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    const hands = () => screen.getAllByRole('button', { name: /^\d\d:\d\d/ }).map((b) => b.textContent);
    expect(hands()).toEqual([
      '13:15K6o · BTNFehler',
      '13:3673s · BBFehler',
      '15:10A4o · HJFehler',
      '13:0964o · UTG+1Richtig',
      '15:46AQs · CORichtig',
      '13:3654s · UTGNicht bewertet',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Nur Fehler' }));
    expect(hands()).toHaveLength(3);
  });

  it('shows a postflop "fraglich" under "Auch fraglich" but not under "Nur Fehler"', async () => {
    await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    expect(screen.getByRole('button', { name: /66 · UTG/ }).textContent).toContain('Fraglich');
    fireEvent.click(screen.getByRole('button', { name: 'Nur Fehler' }));
    expect(screen.getByText('Keine Hände für diesen Filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Auch fraglich' }));
    expect(screen.getByRole('button', { name: /66 · UTG/ })).toBeTruthy();
  });

  it('changes the kind: errors become hints and are not counted', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.change(screen.getByLabelText('Art des Turniers'), { target: { value: 'satellit' } });
    await waitFor(() => expect(screen.getAllByText('Hinweis')).toHaveLength(3));
    expect(screen.getByText(/· 0 Fehler ·/)).toBeTruthy();
  });

  it('deletes a tournament after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { review } = await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    fireEvent.click(screen.getByRole('button', { name: 'Turnier löschen' }));
    expect(await screen.findByText('Noch keine Hände importiert.')).toBeTruthy();
    expect(review.getSnapshot().tournaments).toEqual([]);
  });

  it('shows why the kind and the delete button are disabled when the archive is not writable', async () => {
    const first = await withHands(bounty);
    first.unmount();
    const second = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { reviewBackend: first.reviewBackend, info: { otherTabActive: true } });
    await act(() => second.loaded);
    await openTournament('Bounty Hunters $2.50');
    expect((screen.getByLabelText('Art des Turniers') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Turnier löschen' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(LOCK_OTHER_TAB)).toBeTruthy();
  });
});

describe('ReviewScreen hand view', () => {
  it('shows the first decision with the chart verdict next to the replay table', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.click(screen.getByRole('button', { name: /K6o · BTN/ }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByText('Du bist dran – deine Wahl: Raise auf 3 BB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByText('Chart für 100 BB · 92 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Preflop · Pot 2,5 BB · zu callen 1 BB · Stack 92 BB')).toBeTruthy();
  });

  it('rates push/fold spots with the push/fold chart', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.click(screen.getByRole('button', { name: /A4o · HJ/ }));
    expect(screen.getByText('Push/Fold-Daten · 16,4 BB effektiv')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A4o bei 16 BB – Range für diesen Spot' })).toBeTruthy();
  });

  it('steps through the hand and jumps between decisions with ← and →', async () => {
    await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    fireEvent.click(screen.getByRole('button', { name: /66 · UTG/ }));
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Du bist dran – deine Wahl: Bet 4,4 BB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Passt' })).toBeTruthy();
    expect(screen.getByText('Einsatz in üblicher Größe.')).toBeTruthy();
    expect(screen.getByText('Einsatz 50 % vom Pot · SPR 8,7 · 8 Outs')).toBeTruthy();
    expect(screen.getByText(/^Gegner CO: Call gegen deinen Open · Chart für 100 BB · etwa \d+ Kombinationen$/)).toBeTruthy();
    expect(screen.getByText('Faustregel, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByLabelText('Board')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schritt vor' }));
    expect(screen.getByText('CO: Call 4,4 BB')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Du bist dran – deine Wahl: Bet 4,4 BB')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Du bist dran – deine Wahl: Raise auf 3 BB')).toBeTruthy();
    expect((screen.getByRole('button', { name: '← Entscheidung' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '← Turnier' }));
    expect(screen.getByRole('heading', { name: 'Bounty Hunters $2.50' })).toBeTruthy();
  });

  it('shows the satellite hint instead of "Falsch"', async () => {
    await withHands(steps);
    // Two Step tournaments with the same name; the older one (second row) holds the KJo hand.
    await openTournament('$0.50 Step to The Weekender', 1);
    fireEvent.click(screen.getByRole('button', { name: /KJo · SB/ }));
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Falsch' })).toBeNull();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.getByText('Näherung: Chart für 40 BB · 25,4 BB effektiv')).toBeTruthy();
  });

  it('shows how many spots from normal tournaments wait in the retraining', async () => {
    await withHands(`${dailyClassic}

${steps}`);
    expect(screen.getByText('Nachtraining: 3 Spots aus deinen Turnieren warten im Training.')).toBeTruthy();
  });
});

describe('ReviewScreen with saved situations (Plan 10)', () => {
  it('lists the situation tournaments, shows the names and keeps their kind fixed', async () => {
    const utils = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(async () => {
      await utils.loaded;
      await utils.review.saveSituation(situationText(sevenTwoOpen('bounty'), TEST_PLAYED_AT), '72o UTG · 40 BB');
    });
    const row = screen.getByRole('row', { name: /Eigene Situationen \(Bounty\)/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['14.10.2026', 'Bounty', '1', '0', '0', '0']);
    await openTournament('Eigene Situationen (Bounty)');
    expect(screen.queryByLabelText('Art des Turniers')).toBeNull();
    expect(screen.getByText('Art: Bounty (beim Nachstellen gewählt)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /72o UTG · 40 BB/ }));
    expect(screen.getByText(/^72o UTG · 40 BB · 14\.10\.2026 18:05 · Level 1/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
  });

  it('starts a new situation from the overview', async () => {
    const onSituation = vi.fn();
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} onSituation={onSituation} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Situation nachstellen' }));
    expect(onSituation).toHaveBeenCalledOnce();
  });
});
