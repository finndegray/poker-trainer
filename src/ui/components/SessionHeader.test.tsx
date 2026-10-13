// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { startRun } from '../../game/endphase-run';
import { SessionHeader } from './SessionHeader';

describe('SessionHeader', () => {
  it('shows nothing for training', () => {
    const { container } = render(<SessionHeader session={{ kind: 'training' }} activeRun={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows the daily progress', () => {
    render(
      <SessionHeader
        session={{ kind: 'daily', dateKey: '2026-10-13', spots: new Array(20).fill(null), index: 6, correct: 5, startedAt: 0, outcome: null }}
        activeRun={null}
      />,
    );
    expect(screen.getByText('Daily Challenge · Spot 7/20 · 5 richtig')).toBeTruthy();
  });

  it('shows level, stack, spot and lives of a running run', () => {
    render(<SessionHeader session={{ kind: 'run', outcome: null }} activeRun={{ ...startRun(), levelIndex: 2, spotInLevel: 3, lives: 2 }} />);
    expect(screen.getByText('Level 3/8 · 14 BB · Spot 4/5')).toBeTruthy();
    expect(screen.getByLabelText('Leben: 2 von 3').textContent).toBe('♥♥♡');
  });

  it('marks a finished run', () => {
    render(<SessionHeader session={{ kind: 'run', outcome: null }} activeRun={null} />);
    expect(screen.getByText('Endphase-Run beendet')).toBeTruthy();
  });
});
