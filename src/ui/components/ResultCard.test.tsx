// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultCard, formatDuration } from './ResultCard';

const daily = (accepted: boolean, isPersonalBest: boolean) => ({
  kind: 'daily' as const,
  dateKey: '2026-10-13',
  spots: [],
  index: 19,
  correct: 17,
  startedAt: 0,
  outcome: { result: { dateKey: '2026-10-13', correct: 17, total: 20, durationMs: 65_400 }, accepted, isPersonalBest },
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(600_000)).toBe('10:00');
  });
});

describe('ResultCard', () => {
  it('shows a daily result with personal best and buttons', () => {
    const onRestart = vi.fn();
    const onHome = vi.fn();
    render(<ResultCard session={daily(true, true)} onRestart={onRestart} onHome={onHome} />);
    expect(screen.getByRole('heading', { name: 'Daily Challenge geschafft' })).toBeTruthy();
    expect(screen.getByText('17 von 20 richtig')).toBeTruthy();
    expect(screen.getByText('Zeit: 1:05')).toBeTruthy();
    expect(screen.getByText('Neue Bestleistung!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal üben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zum Menü' }));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
  });

  it('explains a repeated daily that does not count', () => {
    render(<ResultCard session={daily(false, false)} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByText('Heute bereits gewertet – dieser Durchgang zählt nicht.')).toBeTruthy();
    expect(screen.queryByText('Neue Bestleistung!')).toBeNull();
  });

  it('shows a run result', () => {
    const summary = { ts: 1, dateKey: '2026-10-13', placement: 1147, finalTable: false, levelsCompleted: 3, bonusXp: 30 };
    render(<ResultCard session={{ kind: 'run', outcome: { summary, isPersonalBest: true } }} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Ausgeschieden' })).toBeTruthy();
    expect(screen.getByText('Platz 1.147 von 2.000')).toBeTruthy();
    expect(screen.getByText('3 von 8 Leveln geschafft · +30 Bonus-XP')).toBeTruthy();
    expect(screen.getByText('Neue Bestplatzierung!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neuer Run' })).toBeTruthy();
  });

  it('celebrates the final table', () => {
    const summary = { ts: 1, dateKey: '2026-10-13', placement: 1, finalTable: true, levelsCompleted: 8, bonusXp: 180 };
    render(<ResultCard session={{ kind: 'run', outcome: { summary, isPersonalBest: false } }} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Final Table erreicht!' })).toBeTruthy();
    expect(screen.getByText('Platz 1 von 2.000')).toBeTruthy();
  });
});
