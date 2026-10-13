// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnswerResult } from '../../app/game-store';
import { parseHand } from '../../engine/cards';
import { comparePositions } from '../../engine/position-compare';
import { seatOf } from '../../engine/positions';
import { type Action, type Spot, chart } from '../../engine/pushfold';
import { makeFixture } from '../../engine/test-fixtures';
import { recordDecision } from '../../game/session';
import { emptyState, type SaveState } from '../../storage/schema';
import { FeedbackPanel } from './FeedbackPanel';

const data = makeFixture((_, s) => (s.kind === 'open' ? seatOf(s.position) - 3.5 : seatOf(s.position) - 6.5));
const a7oOnCo: Spot = { kind: 'open', position: 'CO', stack: 12, hand: parseHand('A7o') };

function answer(spot: Spot, chosen: Action, state: SaveState = emptyState()): AnswerResult {
  const outcome = recordDecision(data, state, { spot, chosen, responseMs: 1500, mode: 'training', now: new Date(2026, 9, 13) });
  return { outcome, comparison: comparePositions(data, spot), chart: chart(data, spot) };
}

describe('FeedbackPanel', () => {
  it('explains a correct decision with EVs, XP, chart and position comparison', () => {
    render(<FeedbackPanel result={answer(a7oOnCo, 'shove')} spot={a7oOnCo} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: All-in')).toBeTruthy();
    expect(screen.getByText('All-in +0,50 BB · Fold 0 BB')).toBeTruthy();
    expect(screen.getByText('+15 XP')).toBeTruthy();
    expect(screen.getByText('A7o bei 12 BB – Range für diesen Spot')).toBeTruthy();
    expect(screen.getByTitle('A7o: Push').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTitle('UTG: Fold (−3,50 BB)')).toBeTruthy();
    expect(screen.getByText('A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO')).toBeTruthy();
  });

  it('shows the better action after a mistake', () => {
    render(<FeedbackPanel result={answer(a7oOnCo, 'fold')} spot={a7oOnCo} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Fold · Besser: All-in')).toBeTruthy();
    expect(screen.getByText('0 XP')).toBeTruthy();
  });

  it('shows combo and rank-up', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 490, combo: 4, soundOn: true } };
    render(<FeedbackPanel result={answer(a7oOnCo, 'shove', state)} spot={a7oOnCo} />);
    expect(screen.getByText('+23 XP · Combo ×1,5 · 5 in Folge')).toBeTruthy();
    expect(screen.getByText('Aufgestiegen: Donkey!')).toBeTruthy();
  });

  it('uses Call wording for call spots', () => {
    const spot: Spot = { kind: 'call', shover: 'BTN', position: 'BB', stack: 8, hand: parseHand('K9o') };
    render(<FeedbackPanel result={answer(spot, 'call')} spot={spot} />);
    expect(screen.getByText('Deine Wahl: Call')).toBeTruthy();
    expect(screen.getByTitle('K9o: Call')).toBeTruthy();
    expect(screen.getByText('K9o bei 8 BB gegen Shove aus BTN: Fold aus SB, Call aus BB')).toBeTruthy();
  });
});
