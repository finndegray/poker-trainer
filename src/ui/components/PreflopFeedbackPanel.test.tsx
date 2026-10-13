// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type PreflopAnswerResult, preflopAnswerResult } from '../../app/game-store';
import { parseHand } from '../../engine/cards';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions } from '../../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../../engine/preflop/spots';
import { recordPreflopDecision } from '../../game/session';
import { emptyState, type SaveState } from '../../storage/schema';
import { PreflopFeedbackPanel } from './PreflopFeedbackPanel';

const a9oOnCo: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'CO', villain: null, hand: parseHand('A9o') };

function answer(spot: PreflopSpot, chosen: PreflopAction, state: SaveState = emptyState()): PreflopAnswerResult {
  return preflopAnswerResult(recordPreflopDecision(state, { spot, chosen, responseMs: 1500, now: new Date(2026, 9, 13) }));
}

const legend = (container: HTMLElement): (string | null)[] =>
  Array.from(container.querySelectorAll('.range-chart__legend-item'), (item) => item.textContent);

describe('PreflopFeedbackPanel', () => {
  it('explains a correct open-raise with chart, learning sentence, hint and position comparison', () => {
    const { container } = render(<PreflopFeedbackPanel result={answer(a9oOnCo, 'raise')} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Raise')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise')).toBeTruthy();
    expect(screen.getByText('+15 XP')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A9o · Open-Raise aus CO · 100 BB' })).toBeTruthy();
    expect(screen.getByTitle('A9o: Raise').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTitle('A9o: Raise').className).toContain('cell--aggressive');
    expect(legend(container)).toEqual(['Raise', 'Grenzfall', 'Fold']);
    expect(screen.getByText(chartFor(a9oOnCo).note)).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dieselbe Hand auf anderen Positionen' })).toBeTruthy();
    expect(screen.getByTitle('UTG: Fold')).toBeTruthy();
    expect(screen.getByTitle('HJ: Grenzfall').className).toContain('cell--borderline');
    expect(screen.getByTitle('CO: Raise').className).toContain('position-row__item--hero');
    expect(screen.getByText('A9o (100 BB, Open-Raise): Fold aus UTG bis LJ, knapp aus HJ, Raise ab CO')).toBeTruthy();
  });

  it('shows the correct action after a mistake', () => {
    render(<PreflopFeedbackPanel result={answer(a9oOnCo, 'fold')} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise')).toBeTruthy();
    expect(screen.getByText('0 XP')).toBeTruthy();
  });

  it('names the allowed alternative of a borderline hand', () => {
    const fours: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('44') };
    render(<PreflopFeedbackPanel result={answer(fours, 'fold')} />);
    expect(screen.getByRole('heading', { name: 'Knapp – beides okay' })).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise (auch okay: Fold)')).toBeTruthy();
    expect(screen.getByTitle('44: Grenzfall').getAttribute('aria-current')).toBe('true');
  });

  it('uses four colours and compares openers against an open-raise', () => {
    const spot: PreflopSpot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG', hand: parseHand('JJ') };
    const { container } = render(<PreflopFeedbackPanel result={answer(spot, 'call')} />);
    expect(screen.getByRole('heading', { name: 'JJ · BTN gegen Open-Raise aus UTG · 100 BB' })).toBeTruthy();
    expect(legend(container)).toEqual(['3-Bet', 'Call', 'Grenzfall', 'Fold']);
    expect(screen.getByTitle('JJ: Call').className).toContain('cell--call');
    expect(screen.getByRole('heading', { name: 'Dieselbe Hand gegen andere Opener' })).toBeTruthy();
    expect(screen.getByText(comparePreflopPositions(spot).summary)).toBeTruthy();
  });

  it('calls the 4-bet at 40 BB all-in and shows combo and rank-up', () => {
    const spot: PreflopSpot = { kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB', hand: parseHand('AA') };
    const state: SaveState = { ...emptyState(), profile: { xp: 490, combo: 4, soundOn: true } };
    const { container } = render(<PreflopFeedbackPanel result={answer(spot, 'fourBet', state)} />);
    expect(screen.getByText('Deine Wahl: All-in')).toBeTruthy();
    expect(legend(container)[0]).toBe('All-in');
    expect(screen.getByTitle('AA: All-in')).toBeTruthy();
    expect(screen.getByText('+23 XP · Combo ×1,5 · 5 in Folge')).toBeTruthy();
    expect(screen.getByText('Aufgestiegen: Donkey!')).toBeTruthy();
  });
});
