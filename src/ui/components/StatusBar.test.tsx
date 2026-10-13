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
    expect(screen.getByTitle('Tage in Folge mit mindestens 20 Spots')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Fortschritt zum nächsten Rang' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('shows the reached daily goal instead of a count above the target', () => {
    const state = { ...emptyState(), days: { '2026-10-13': 23 } };
    render(<StatusBar status={statusOf(state, now)} xp={0} />);
    expect(screen.getByText('Tagesziel erreicht ✓ · 23 Spots')).toBeTruthy();
    expect(screen.queryByText(/23\/20/)).toBeNull();
  });

  it('switches to the reached goal exactly at the target', () => {
    const state = { ...emptyState(), days: { '2026-10-13': 20 } };
    render(<StatusBar status={statusOf(state, now)} xp={0} />);
    expect(screen.getByText('Tagesziel erreicht ✓ · 20 Spots')).toBeTruthy();
  });

  it('takes the streak tooltip from the daily target', () => {
    const status = statusOf(emptyState(), now);
    render(<StatusBar status={{ ...status, dayProgress: { ...status.dayProgress, target: 25 } }} xp={0} />);
    expect(screen.getByTitle('Tage in Folge mit mindestens 25 Spots')).toBeTruthy();
  });

  it('handles the top rank', () => {
    const state = { ...emptyState(), profile: { xp: 50000, combo: 0, soundOn: true } };
    render(<StatusBar status={statusOf(state, now)} xp={50000} />);
    expect(screen.getByText('Höchster Rang erreicht')).toBeTruthy();
    expect(screen.getByText('Streak 0 Tage')).toBeTruthy();
  });
});
