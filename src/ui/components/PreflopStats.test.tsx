// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { Position } from '../../engine/positions';
import type { PreflopKind, StackDepth } from '../../engine/preflop/spots';
import type { Verdict } from '../../engine/pushfold';
import type { PreflopRecord } from '../../game/stats';
import { PreflopStats } from './PreflopStats';

let ts = 0;
const pre = (
  kind: PreflopKind, hero: Position, villain: Position | null, stack: StackDepth, hand: string, verdict: Verdict,
): PreflopRecord => ({
  ts: ++ts, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
  spot: { kind, stack, hero, villain, hand: parseHand(hand) }, chosen: 'fold', verdict, responseMs: 2000,
});
const records = [
  pre('rfi', 'CO', null, 100, 'A9o', 'wrong'),
  pre('rfi', 'CO', null, 100, 'A9o', 'correct'),
  pre('vsOpen', 'BB', 'UTG', 40, 'KJo', 'close'),
  pre('vs3bet', 'CO', 'BTN', 100, 'AQo', 'wrong'),
];

function cells(title: string, label: string): string[] {
  const table = screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
  const row = within(table).getByRole('rowheader', { name: label }).closest('tr') as HTMLTableRowElement;
  return Array.from(row.cells, (cell) => cell.textContent ?? '');
}

describe('PreflopStats', () => {
  it('invites to try the training without records', () => {
    render(<PreflopStats records={[]} />);
    expect(screen.getByRole('region', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByText(/Noch keine Starthand-Entscheidungen/)).toBeTruthy();
  });

  it('shows the hit rate by spot type, position and stack', () => {
    render(<PreflopStats records={records} />);
    expect(cells('Starthände nach Spot-Typ', 'Open-Raise')).toEqual(['Open-Raise', '2', '50 %']);
    expect(cells('Starthände nach Spot-Typ', 'Gegen Open-Raise')).toEqual(['Gegen Open-Raise', '1', '100 %']);
    expect(cells('Starthände nach Spot-Typ', 'Gegen 3-Bet')).toEqual(['Gegen 3-Bet', '1', '0 %']);
    expect(cells('Starthände nach Position', 'CO')).toEqual(['CO', '3', '33 %']);
    expect(cells('Starthände nach Position', 'BB')).toEqual(['BB', '1', '100 %']);
    expect(cells('Starthände nach Stack', '40 BB')).toEqual(['40 BB', '1', '100 %']);
    expect(cells('Starthände nach Stack', '100 BB')).toEqual(['100 BB', '3', '33 %']);
    const tiles = within(screen.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(tiles.getByText('50 %')).toBeTruthy();
    expect(tiles.getByText('4')).toBeTruthy();
    expect(tiles.getByText('2,0 s')).toBeTruthy();
  });

  it('shows the error heatmap per spot type', () => {
    render(<PreflopStats records={records} />);
    expect(screen.getByRole('heading', { name: 'Starthände: Fehler-Heatmap' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTitle('A9o: 1 von 2 falsch')).toBeTruthy();
    expect(screen.getByTitle('AQo: noch nicht gespielt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gegen 3-Bet' }));
    expect(screen.getByTitle('AQo: 1 von 1 falsch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gegen 3-Bet' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Gegen Open-Raise' }));
    expect(screen.getByTitle('KJo: 0 von 1 falsch')).toBeTruthy();
  });
});
