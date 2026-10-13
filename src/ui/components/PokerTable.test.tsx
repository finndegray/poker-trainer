// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseCard, parseHand } from '../../engine/cards';
import { PokerTable, PreflopTable } from './PokerTable';

const cards = [parseCard('Ah'), parseCard('7c')] as const;

describe('PokerTable', () => {
  it('shows all seats, the hero cards and the info line for an open spot', () => {
    render(<PokerTable spot={{ kind: 'open', position: 'CO', stack: 12, hand: parseHand('A7o') }} cards={cards} />);
    expect(screen.getByText('Du sitzt im CO · 12 BB · noch 3 Spieler hinter dir')).toBeTruthy();
    expect(screen.getByText('Alle folden zu dir')).toBeTruthy();
    expect(screen.getByTestId('seat-UTG').className).toContain('seat--folded');
    expect(screen.getByTestId('seat-CO').className).toContain('seat--hero');
    expect(screen.getByTestId('seat-BB').textContent).toContain('Ante 1');
    expect(screen.getByLabelText('Dealer-Button')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Herz Ass' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Kreuz 7' })).toBeTruthy();
    expect(screen.getByText('Pot 2,5 BB')).toBeTruthy();
  });

  it('marks the shover in a call spot', () => {
    render(<PokerTable spot={{ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand: parseHand('A7o') }} cards={cards} />);
    expect(screen.getByText('BTN geht All-in')).toBeTruthy();
    expect(screen.getByTestId('seat-BTN').textContent).toContain('All-in 12 BB');
    expect(screen.getByText('Du sitzt im BB · 12 BB · du handelst als Letzter')).toBeTruthy();
    expect(screen.getByText('Pot 14,5 BB')).toBeTruthy();
  });

  it('shows the higher card first', () => {
    const lowFirst = [parseCard('7c'), parseCard('Ah')] as const;
    render(<PokerTable spot={{ kind: 'open', position: 'CO', stack: 12, hand: parseHand('A7o') }} cards={lowFirst} />);
    expect(screen.getAllByRole('img').map((img) => img.getAttribute('aria-label'))).toEqual(['Herz Ass', 'Kreuz 7']);
  });
});

describe('PreflopTable', () => {
  const hand = parseHand('A7o');

  it('shows the open-raise as a bet, the stacks and the players behind', () => {
    render(<PreflopTable spot={{ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand }} cards={cards} />);
    expect(screen.getByText('CO erhöht auf 2,2 BB')).toBeTruthy();
    expect(screen.getByTestId('seat-CO').textContent).toContain('Raise 2,2 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('Stack 97,8');
    expect(screen.getByTestId('seat-CO').className).toContain('seat--raiser');
    expect(screen.getByTestId('seat-BTN').textContent).toContain('Stack 100');
    expect(screen.getByTestId('seat-BTN').className).toContain('seat--hero');
    expect(screen.getByText('Du sitzt im BTN · 100 BB effektiv · noch 2 Spieler hinter dir')).toBeTruthy();
    expect(screen.getByText('Pot 4,7 BB')).toBeTruthy();
  });

  it('shows the own open and the 3-bet', () => {
    render(<PreflopTable spot={{ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand }} cards={cards} />);
    expect(screen.getByText('BTN 3-bettet auf 6,6 BB')).toBeTruthy();
    expect(screen.getByTestId('seat-BTN').textContent).toContain('3-Bet 6,6 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('2,2 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('Stack 97,8');
    expect(screen.getByText('Du sitzt im CO · 100 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Pot 11,3 BB')).toBeTruthy();
  });

  it('shows an unopened pot', () => {
    render(<PreflopTable spot={{ kind: 'rfi', stack: 40, hero: 'UTG1', villain: null, hand }} cards={cards} />);
    expect(screen.getByText('Alle folden zu dir')).toBeTruthy();
    expect(screen.getByText('Du sitzt im UTG+1 · 40 BB effektiv · noch 6 Spieler hinter dir')).toBeTruthy();
  });
});
