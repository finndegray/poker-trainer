// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistenceInfo } from '../../app/persistence';
import { handKey, memoryReviewBackend, readHand } from '../../review/archive';
import { retrainingOf } from '../../game/retraining';
import { RTA_NOTICE_KEY } from '../components/RtaNotice';
import { renderWithStore } from '../test-utils';
import { SituationScreen } from './SituationScreen';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const now = () => new Date(2026, 9, 14, 18, 5, 9);
// The rating runs asynchronously; under a full parallel test run it can take longer than the default second.
const SLOW = { timeout: 10_000 };
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
const info = () => screen.getByText(/^Du sitzt im /).textContent;

function pickCards(group: string, ...names: string[]) {
  const picker = screen.getByRole('group', { name: group });
  for (const name of names) fireEvent.click(within(picker).getByRole('button', { name }));
}

type StartOptions = {
  position?: string;
  stack?: string;
  cards?: string[];
  kind?: string;
  readOnly?: boolean;
  info?: Partial<PersistenceInfo>;
  onBack?: () => void;
  onReview?: () => void;
};

async function startSituation(options: StartOptions = {}) {
  window.localStorage.setItem(RTA_NOTICE_KEY, '1');
  const ui = <SituationScreen onBack={options.onBack ?? (() => {})} onReview={options.onReview ?? (() => {})} now={now} />;
  const archive = memoryReviewBackend();
  const utils = renderWithStore(ui, { info: { readOnly: options.readOnly ?? false, ...options.info }, reviewBackend: archive });
  await act(() => utils.loaded);
  fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: options.stack ?? '40' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Deine Position' })).getByRole('button', { name: options.position ?? 'UTG' }));
  pickCards('Deine Karten', ...(options.cards ?? ['Kreuz 7', 'Karo 2']));
  if (options.kind) fireEvent.click(within(screen.getByRole('group', { name: 'Turnierart' })).getByRole('button', { name: options.kind }));
  click('Weiter');
  return { ...utils, archive };
}

/** 72o open from UTG, everybody folds, then the summary. */
async function playToSummary(options: StartOptions = {}) {
  const utils = await startSituation(options);
  click(/^Raise auf 2,2 BB/);
  for (let i = 0; i < 7; i++) click(/^Fold/);
  click('Zur Zusammenfassung');
  await screen.findByRole('button', { name: /^Preflop · Raise auf 2,2 BB · / }, SLOW);
  return utils;
}

describe('SituationScreen: hint and setup', () => {
  it('shows the GGPoker hint once and never touches the save for it', async () => {
    const first = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => first.loaded);
    expect(screen.getByRole('note').textContent).toContain('Hilfsmittel während laufender Hände sind bei GGPoker verboten');
    click('Verstanden');
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    const second = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => second.loaded);
    expect(screen.queryByRole('note')).toBeNull();
    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).not.toHaveBeenCalled();
  });

  it('starts only with two cards and valid stacks', async () => {
    const { loaded } = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => loaded);
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    pickCards('Deine Karten', 'Pik Ass', 'Herz König');
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: '0,5' } });
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Stacks von 1 bis 200 BB, Schrittweite 0,1/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: '12,5' } });
    click('Gegner-Stacks anpassen');
    fireEvent.change(screen.getByLabelText('BTN'), { target: { value: '300' } });
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('BTN'), { target: { value: '8' } });
    click('Weiter');
    expect(screen.getByTestId('seat-BTN').textContent).toContain('Stack 7,9');
    expect(screen.getByTestId('seat-UTG').textContent).toContain('Stack 12,4');
  });
});

describe('SituationScreen: input and live rating', () => {
  it('rates the hero decision right away, asks the others in order and takes steps back', async () => {
    await startSituation();
    expect(info()).toBe('Du sitzt im UTG · Du bist dran');
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByRole('heading', { name: 'Falsch' }, SLOW)).toBeTruthy();
    expect(info()).toBe('Du sitzt im UTG · UTG+1 ist dran');
    for (let i = 0; i < 7; i++) click(/^Fold/);
    expect(info()).toBe('Du sitzt im UTG · Alle anderen haben gefoldet – du gewinnst den Pot');
    click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · BB ist dran');
    for (let i = 0; i < 7; i++) click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · Du bist dran');
    expect(screen.getByText('Deine Auswertung erscheint hier, sobald du dich entschieden hast.')).toBeTruthy();
    click('← Zurück');
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
  });

  it('offers an empty seat only at the start and locks used cards on the board', async () => {
    await startSituation({ position: 'CO', cards: ['Herz Ass', 'Karo König'] });
    expect(info()).toBe('Du sitzt im CO · UTG ist dran');
    click(/^Platz leer/);
    expect(screen.queryByTestId('seat-UTG')).toBeNull();
    expect(info()).toBe('Du sitzt im CO · UTG+1 ist dran');
    click(/^Fold/);
    expect(screen.queryByRole('button', { name: /^Platz leer/ })).toBeNull();
    click(/^Fold/);
    click(/^Fold/);
    click(/^Raise auf 2,2 BB/);
    click(/^Fold/);
    click(/^Fold/);
    click(/^Call/);
    expect(info()).toBe('Du sitzt im CO · Flop: drei Karten wählen');
    const flop = screen.getByRole('group', { name: 'Flop-Karten' });
    expect((within(flop).getByRole('button', { name: 'Herz Ass' }) as HTMLButtonElement).disabled).toBe(true);
    expect((button('Flop übernehmen') as HTMLButtonElement).disabled).toBe(true);
    pickCards('Flop-Karten', 'Pik 9', 'Kreuz 5', 'Karo 2');
    click('Flop übernehmen');
    expect(screen.getAllByRole('img', { name: /^(Pik 9|Kreuz 5|Karo 2)$/ })).toHaveLength(3);
    expect(info()).toBe('Du sitzt im CO · BB ist dran');
  });

  it('lets the bet size be changed and turns a size above the stack into the all-in', async () => {
    await startSituation();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '3' } });
    expect(button(/^Raise auf 3 BB/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '1' } });
    expect(button(/^Raise auf 2 BB/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '500' } });
    expect(screen.queryByRole('button', { name: /^Raise auf/ })).toBeNull();
    click(/^All-in 39,9 BB/);
    expect(screen.getByTestId('seat-UTG').textContent).toContain('All-in 39,9 BB');
  });

  it('shows the size actually used when the typed one is changed, and the waiting state while rating', async () => {
    await startSituation();
    const size = screen.getByLabelText(/^Raise auf \(BB\)/);
    fireEvent.change(size, { target: { value: '3' } });
    expect(screen.queryByText(/^Es gilt:/)).toBeNull();
    fireEvent.change(size, { target: { value: '1' } });
    expect(screen.getByText('Es gilt: 2 BB')).toBeTruthy();
    fireEvent.change(size, { target: { value: 'abc' } });
    expect(screen.getByText('Es gilt: 2,2 BB')).toBeTruthy();
    click(/^Raise auf 2,2 BB/);
    expect(screen.getByText('Bewertung läuft …')).toBeTruthy();
    expect(info()).toBe('Du sitzt im UTG · UTG+1 ist dran');
    expect(await screen.findByRole('heading', { name: 'Falsch' }, SLOW)).toBeTruthy();
  });

  it('says so when a situation cannot be rated, without breaking the input', async () => {
    const { review } = await startSituation();
    vi.spyOn(review, 'rateHand').mockRejectedValue(new Error('kaputt'));
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByText('Diese Situation kann ich nicht bewerten.', {}, SLOW)).toBeTruthy();
    expect(info()).toBe('Du sitzt im UTG · UTG+1 ist dran');
  });

  it('analyses in read-only mode, too', async () => {
    const { save } = await startSituation({ readOnly: true });
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByRole('heading', { name: 'Falsch' }, SLOW)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('SituationScreen: summary and saving', () => {
  const handId = `SIT${now().getTime()}`;

  it('sums up every decision and saves the situation with its name; only the retraining queue reaches the save', async () => {
    const { archive, store } = await playToSummary();
    expect(button(/^Preflop · Raise auf 2,2 BB · Fehler$/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('72o UTG · 40 BB');
    fireEvent.change(name, { target: { value: 'Mein Spot' } });
    click('Speichern');
    expect((await screen.findByRole('status', {}, SLOW)).textContent).toBe('Gespeichert in „Eigene Situationen“.');
    expect(readHand(archive.dump()[handKey(handId)])).toMatchObject({
      name: 'Mein Spot',
      tournamentId: 'SIT-normal',
      playedAt: '2026-10-14 18:05:09',
    });
    const save = store.getSnapshot().save;
    expect(retrainingOf(save).entries.map((e) => e.key)).toEqual([`${handId}:10`]);
    expect(save.profile.xp).toBe(0);
    expect(save.decisions).toEqual([]);
    expect(save.days).toEqual({});
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('saves a satellite situation without touching the game save', async () => {
    const { save } = await playToSummary({ kind: 'Satellit' });
    expect(button(/^Preflop · Raise auf 2,2 BB · Hinweis$/)).toBeTruthy();
    click('Speichern');
    expect((await screen.findByRole('status', {}, SLOW)).textContent).toBe('Gespeichert in „Eigene Situationen (Satellit)“.');
    expect(save).not.toHaveBeenCalled();
  });

  it('opens the hand review after saving', async () => {
    const onReview = vi.fn();
    await playToSummary({ onReview });
    click('Speichern');
    await screen.findByRole('status', {}, SLOW);
    click('Im Hand-Review ansehen');
    expect(onReview).toHaveBeenCalledOnce();
  });

  it('blocks saving in another tab with the reason; discarding starts over with the same entries', async () => {
    const { archive } = await playToSummary({ info: { otherTabActive: true } });
    expect((button('Speichern') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Speichern ist nur in dem Tab möglich, der deinen Fortschritt speichert.')).toBeTruthy();
    click('Verwerfen');
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(false);
    expect(archive.dump()).toEqual({});
  });

  it('goes back from the summary to the hand', async () => {
    await playToSummary();
    click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · Alle anderen haben gefoldet – du gewinnst den Pot');
  });

  it('takes the cards of the opponents at the showdown', async () => {
    await startSituation({ position: 'BB' });
    click(/^All-in 39,9 BB/);
    for (let i = 0; i < 6; i++) click(/^Fold/);
    click(/^Call 38,9 BB · All-in/);
    expect(info()).toBe('Du sitzt im BB · Flop: drei Karten wählen (optional, alle sind all-in)');
    click('Ohne restliches Board beenden');
    pickCards('Karten von UTG', 'Pik Dame', 'Herz Dame');
    click('Karten übernehmen');
    expect(screen.getByText('UTG zeigt Qs Qh')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Karten von UTG' })).toBeNull();
  });

  it('asks before an entered situation is left unsaved', async () => {
    const onBack = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await startSituation({ onBack });
    click('← Menü');
    expect(confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
    click(/^Raise auf 2,2 BB/);
    click('← Menü');
    expect(confirm).toHaveBeenCalledWith('Situation verwerfen?');
    expect(onBack).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    click('← Menü');
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('words the lock reason for saving, also in read-only mode', async () => {
    await playToSummary({ readOnly: true });
    expect((button('Speichern') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Speichern ist im Nur-Lesen-Modus nicht möglich.')).toBeTruthy();
  });

  it('does not ask to discard a situation that was saved', async () => {
    const onBack = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await playToSummary({ onBack });
    click('Speichern');
    await screen.findByRole('status', {}, SLOW);
    click('← Menü');
    expect(confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('locks back, discard and the menu while saving', async () => {
    const onBack = vi.fn();
    const { review } = await playToSummary({ onBack });
    let finish: () => void = () => {};
    vi.spyOn(review, 'saveSituation').mockReturnValue(new Promise((resolve) => (finish = () => resolve({ name: 'X' } as never))));
    click('Speichern');
    expect((button('← Zurück') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Verwerfen') as HTMLButtonElement).disabled).toBe(true);
    expect((button('← Menü') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect(await screen.findByRole('status')).toBeTruthy();
    expect((button('← Menü') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a failing save as an alert; a non-Error failure gets a fixed text', async () => {
    const { review } = await playToSummary();
    const spy = vi.spyOn(review, 'saveSituation').mockRejectedValueOnce(new Error('Platte voll'));
    click('Speichern');
    expect((await screen.findByRole('alert')).textContent).toBe('Speichern fehlgeschlagen: Platte voll');
    spy.mockRejectedValueOnce('boom');
    click('Speichern');
    await screen.findByText('Speichern fehlgeschlagen: Unbekannter Fehler');
    expect((button('Speichern') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps saving disabled for a blank name', async () => {
    await playToSummary();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    expect((button('Speichern') as HTMLButtonElement).disabled).toBe(true);
  });

  it('names a situation with a decimal stack with a comma', async () => {
    await playToSummary({ stack: '12,5' });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('72o UTG · 12,5 BB');
  });

  it('resets the picked opponent cards when another opponent is chosen', async () => {
    await startSituation({ position: 'BB' });
    click(/^All-in 39,9 BB/);
    for (let i = 0; i < 5; i++) click(/^Fold/);
    click(/^Call/);
    click(/^Call/);
    click('Ohne restliches Board beenden');
    pickCards('Karten von UTG', 'Pik Dame');
    click('SB');
    expect(screen.getByRole('group', { name: 'Karten von SB' })).toBeTruthy();
    click('UTG');
    const picker = screen.getByRole('group', { name: 'Karten von UTG' });
    expect(within(picker).getByRole('button', { name: 'Pik Dame' }).getAttribute('aria-pressed')).not.toBe('true');
  });
});
