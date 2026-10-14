// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

async function startSituation(options: { position?: string; stack?: string; cards?: string[]; readOnly?: boolean } = {}) {
  window.localStorage.setItem(RTA_NOTICE_KEY, '1');
  const utils = renderWithStore(<SituationScreen onBack={() => {}} now={now} />, { info: { readOnly: options.readOnly ?? false } });
  await act(() => utils.loaded);
  fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: options.stack ?? '40' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Deine Position' })).getByRole('button', { name: options.position ?? 'UTG' }));
  pickCards('Deine Karten', ...(options.cards ?? ['Kreuz 7', 'Karo 2']));
  click('Weiter');
  return utils;
}

describe('SituationScreen: hint and setup', () => {
  it('shows the GGPoker hint once and never touches the save for it', async () => {
    const first = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => first.loaded);
    expect(screen.getByRole('note').textContent).toContain('Hilfsmittel während laufender Hände sind bei GGPoker verboten');
    click('Verstanden');
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    const second = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => second.loaded);
    expect(screen.queryByRole('note')).toBeNull();
    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).not.toHaveBeenCalled();
  });

  it('starts only with two cards and valid stacks', async () => {
    const { loaded } = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
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
