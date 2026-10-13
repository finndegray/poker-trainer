// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { statusOf } from '../../game/session';
import { emptyState } from '../../storage/schema';
import { StatusBar } from './StatusBar';

const now = new Date(2026, 9, 13, 12, 0);

describe('StatusBar', () => {
  it('shows rank, XP progress, streak and today\'s count', () => {
    const state = { ...emptyState(), profile: { xp: 1250, combo: 0, soundOn: true }, days: { '2026-10-12': 20, '2026-10-13': 7 } };
    render(<StatusBar status={statusOf(state, now)} xp={1250} />);
    expect(screen.getByText('Donkey')).toBeTruthy();
    expect(screen.getByText('750 XP bis Grinder')).toBeTruthy();
    expect(screen.getByText('Streak 1 Tag')).toBeTruthy();
    expect(screen.getByText('Heute 7/20')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Fortschritt zum nächsten Rang' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('handles the top rank', () => {
    const state = { ...emptyState(), profile: { xp: 50000, combo: 0, soundOn: true } };
    render(<StatusBar status={statusOf(state, now)} xp={50000} />);
    expect(screen.getByText('Höchster Rang erreicht')).toBeTruthy();
    expect(screen.getByText('Streak 0 Tage')).toBeTruthy();
  });
});
