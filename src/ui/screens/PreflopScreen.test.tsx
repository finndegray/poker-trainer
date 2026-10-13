// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreflopFilter } from '../../game/preflop-filter';
import { emptyState, type SaveState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { PreflopScreen } from './PreflopScreen';

const withFilter = (preflopFilter: PreflopFilter): SaveState => ({ ...emptyState(), profile: { ...emptyState().profile, preflopFilter } });

describe('PreflopScreen', () => {
  it('deals a starthand spot with status bar, table and sized buttons', () => {
    const { store } = renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'vs3bet', stack: 40 }) });
    expect(screen.getByRole('progressbar', { name: 'Fortschritt zum nächsten Rang' })).toBeTruthy();
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByText(/3-bettet auf/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All-in 40 BB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    expect(store.getSnapshot().preflopCurrent!.spot).toMatchObject({ kind: 'vs3bet', stack: 40 });
  });

  it('shows the remembered filter and stores a new one in the profile', () => {
    const { store, save } = renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'rfi', stack: 100 }) });
    const kinds = within(screen.getByRole('group', { name: 'Spot-Typ' }));
    const stacks = within(screen.getByRole('group', { name: 'Stack' }));
    expect(kinds.getAllByRole('button').map((b) => b.textContent)).toEqual(['Alle', 'Open-Raise', 'Gegen Open-Raise', 'Gegen 3-Bet']);
    expect(stacks.getAllByRole('button').map((b) => b.textContent)).toEqual(['Alle', '40 BB', '100 BB']);
    expect(kinds.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(stacks.getByRole('button', { name: '100 BB' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Raise auf/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    fireEvent.click(kinds.getByRole('button', { name: 'Gegen Open-Raise' }));
    fireEvent.click(stacks.getByRole('button', { name: 'Alle' }));
    expect(store.getSnapshot().save.profile.preflopFilter).toEqual({ kind: 'vsOpen', stack: 'all' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().preflopCurrent!.spot.kind).toBe('vsOpen');
    expect(kinds.getByRole('button', { name: 'Gegen Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(kinds.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    expect(screen.getByText('Filter: Gegen Open-Raise · alle Stacks')).toBeTruthy();
  });

  it('keeps the filters collapsed behind a summary so the table fits on a phone', () => {
    renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'vs3bet', stack: 40 }) });
    const summary = screen.getByText('Filter: Gegen 3-Bet · 40 BB');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')!.open).toBe(false);
  });

  it('answers with the keyboard: C calls, R and A are aggressive, F folds, space continues', () => {
    renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'vsOpen', stack: 100 }) });
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByText('Deine Wahl: Call')).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByText('Deine Wahl: Call')).toBeNull();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByText('Deine Wahl: 3-Bet')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('Deine Wahl: 3-Bet')).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
  });

  it('keeps the feedback when the filter changes after an answer', () => {
    renderWithStore(<PreflopScreen onBack={() => {}} />);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Stack' })).getByRole('button', { name: '40 BB' }));
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
  });

  it('disables the filter controls in read-only mode and leaves the profile untouched', () => {
    const { store, save } = renderWithStore(<PreflopScreen onBack={() => {}} />, { info: { readOnly: true } });
    const filterButtons = [
      ...within(screen.getByRole('group', { name: 'Spot-Typ' })).getAllByRole('button'),
      ...within(screen.getByRole('group', { name: 'Stack' })).getAllByRole('button'),
    ] as HTMLButtonElement[];
    expect(filterButtons.length).toBeGreaterThan(0);
    expect(filterButtons.every((b) => b.disabled)).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Stack' })).getByRole('button', { name: '40 BB' }));
    expect(store.getSnapshot().save.profile.preflopFilter).toBeUndefined();
    expect(store.getSnapshot().preflopCurrent).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '← Menü' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('goes back to the menu', () => {
    const onBack = vi.fn();
    renderWithStore(<PreflopScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
