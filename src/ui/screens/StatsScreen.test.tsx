// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { Spot, Verdict } from '../../engine/pushfold';
import type { DecisionRecord } from '../../game/stats';
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
    runs: [{ ts: 5, dateKey: '2026-10-12', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 }],
    bestRun: { ts: 5, dateKey: '2026-10-12', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 },
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
    expect(screen.getByRole('img', { name: 'Trefferquote der letzten 8 Wochen' })).toBeTruthy();
    expect(screen.getByText('Beste Platzierung: Platz 312')).toBeTruthy();
    expect(screen.getByText('12.10.: Platz 312')).toBeTruthy();
    const dailies = screen.getAllByText(/^1[0-9]\.10\.: \d+\/20$/).map((el) => el.textContent);
    expect(dailies).toEqual(['13.10.: 18/20', '12.10.: 15/20']);
  });
});
