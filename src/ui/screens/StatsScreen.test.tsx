// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { Spot, Verdict } from '../../engine/pushfold';
import type { DecisionRecord, PreflopRecord } from '../../game/stats';
import { emptyState, type SaveState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { StatsScreen } from './StatsScreen';

let ts = 0;
const rec = (spot: Spot, verdict: Verdict, dateKey = '2026-10-13', responseMs = 3000): DecisionRecord => ({
  ts: ++ts, dateKey, mode: 'training', spot, chosen: 'fold', verdict, responseMs,
});
const open = (position: 'BTN' | 'UTG', stack: number, hand = 'A7o'): Spot => ({ kind: 'open', position, stack, hand: parseHand(hand) });
const call: Spot = { kind: 'call', shover: 'SB', position: 'BB', stack: 12, hand: parseHand('K9o') };

function state(): SaveState {
  return {
    ...emptyState(),
    decisions: [
      rec(open('BTN', 10), 'wrong', '2026-10-13', 2000),
      rec(open('BTN', 10), 'correct', '2026-10-13', 4000),
      rec(open('UTG', 4), 'correct'),
      rec(call, 'wrong', '2026-10-06'),
    ],
    daily: {
      '2026-10-12': { dateKey: '2026-10-12', correct: 15, total: 20, durationMs: 90_000 },
      '2026-10-13': { dateKey: '2026-10-13', correct: 18, total: 20, durationMs: 80_000 },
    },
    runs: [{ ts: 5, dateKey: '2026-10-12', placement: 1240, finalTable: false, levelsCompleted: 3, bonusXp: 30 }],
    bestRun: { ts: 5, dateKey: '2026-10-12', placement: 1240, finalTable: false, levelsCompleted: 3, bonusXp: 30 },
  };
}

describe('StatsScreen', () => {
  it('invites to play when there is no data', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />);
    expect(screen.getByText(/Noch keine Entscheidungen/)).toBeTruthy();
  });

  it('shows totals, tables, heatmap, runs and dailies', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: state() });
    const tiles = within(screen.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(tiles.getByText('50 %')).toBeTruthy();
    expect(tiles.getByText('4')).toBeTruthy();
    expect(tiles.getByText('3,0 s')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nach Position' })).toBeTruthy();
    const btnRow = screen.getByRole('row', { name: /BTN/ });
    expect(btnRow.textContent).toContain('2');
    expect(screen.getByTitle('A7o: 1 von 3 falsch')).toBeTruthy();
    expect(screen.getByTitle('AA: noch nicht gespielt').className).toContain('heat--none');
    fireEvent.click(screen.getByRole('button', { name: 'Call vs. Shove' }));
    expect(screen.getByTitle('K9o: 1 von 1 falsch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call vs. Shove' }).getAttribute('aria-pressed')).toBe('true');
    const chart = within(screen.getByRole('img', { name: 'Trefferquote der letzten 8 Wochen' }));
    expect(chart.getByText('67 %')).toBeTruthy();
    expect(chart.getByText('0 %')).toBeTruthy();
    expect(screen.getByText('Beste Platzierung: Platz 1.240')).toBeTruthy();
    expect(screen.getByText('12.10.: Platz 1.240')).toBeTruthy();
    const dailies = screen.getAllByText(/^1[0-9]\.10\.: \d+\/20$/).map((el) => el.textContent);
    expect(dailies).toEqual(['13.10.: 18/20', '12.10.: 15/20']);
  });

  it('counts only push/fold decisions in the push/fold numbers', () => {
    const pre: PreflopRecord = {
      ts: 99, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
      spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: parseHand('A7o') },
      chosen: 'raise', verdict: 'correct', responseMs: 1000,
    };
    const s = state();
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: { ...s, decisions: [...s.decisions, pre, pre, pre] } });
    const tiles = within(screen.getAllByText('Ø Antwortzeit')[0].closest('.stats-tiles') as HTMLElement);
    expect(tiles.getByText('50 %')).toBeTruthy();
    expect(tiles.getByText('4')).toBeTruthy();
    expect(screen.getAllByTitle('A7o: 1 von 3 falsch')).toHaveLength(1);
  });

  const starthand = (verdict: Verdict): PreflopRecord => ({
    ts: ++ts, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
    spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: parseHand('A7o') },
    chosen: 'raise', verdict, responseMs: 1000,
  });

  it('separates the push/fold numbers from the starthand section', () => {
    const s = state();
    renderWithStore(<StatsScreen onBack={() => {}} />, {
      initial: { ...s, decisions: [...s.decisions, starthand('correct'), starthand('correct'), starthand('correct')] },
    });
    const pushFold = within(screen.getByRole('region', { name: 'Push/Fold' }));
    const pfTiles = within(pushFold.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(pfTiles.getByText('50 %')).toBeTruthy();
    expect(pfTiles.getByText('4')).toBeTruthy();
    expect(pushFold.getByTitle('A7o: 1 von 3 falsch')).toBeTruthy();
    const starthands = within(screen.getByRole('region', { name: 'Starthände' }));
    const shTiles = within(starthands.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(shTiles.getByText('100 %')).toBeTruthy();
    expect(shTiles.getByText('3')).toBeTruthy();
    expect(shTiles.getByText('1,0 s')).toBeTruthy();
    expect(starthands.getByTitle('A7o: 0 von 3 falsch')).toBeTruthy();
  });

  it('shows the starthand section without push/fold decisions', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: { ...emptyState(), decisions: [starthand('wrong')] } });
    expect(screen.queryByText(/Noch keine Entscheidungen/)).toBeNull();
    expect(screen.getByText('Noch keine Push/Fold-Entscheidungen.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände nach Spot-Typ' })).toBeTruthy();
  });
});
