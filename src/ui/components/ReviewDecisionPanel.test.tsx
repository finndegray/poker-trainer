// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import { gradePreflop } from '../../engine/preflop/grading';
import { grade } from '../../engine/pushfold';
import { makeFixture } from '../../engine/test-fixtures';
import type { HeroDecision } from '../../review/analysis';
import type { PostflopRating } from '../../review/postflop';
import type { DecisionRating } from '../../review/preflop';
import { ReviewDecisionPanel } from './ReviewDecisionPanel';

const data = makeFixture((h) => (84 - h) / 10);
const decision = (rating: DecisionRating, over: Partial<HeroDecision> = {}): HeroDecision => ({
  eventIndex: 3, street: 'preflop', action: 'raise', allIn: false, pot: 250, toCall: 100, stack: 3990, amount: 220, to: 220, rating, ...over,
});
const K6o = parseHand('K6o');
const chartSpot = { kind: 'rfi', stack: 40, hero: 'UTG', villain: null, hand: K6o } as const;
const chartRating: DecisionRating = {
  model: 'chart', spot: chartSpot, chosen: 'raise', grade: gradePreflop(chartSpot, 'raise'), effectiveBb: 28.04, approximation: true,
};

describe('ReviewDecisionPanel', () => {
  it('shows a chart verdict with your action, the numbers and the approximation', () => {
    render(<ReviewDecisionPanel decision={decision(chartRating)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Raise')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Fold')).toBeTruthy();
    expect(screen.getByText('Preflop · Pot 2,5 BB · zu callen 1 BB · Stack 39,9 BB')).toBeTruthy();
    expect(screen.getByText('Näherung: Chart für 40 BB · 28 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'K6o · Open-Raise aus UTG · 40 BB' })).toBeTruthy();
  });

  it('turns an error into a hint in satellites and bounty tournaments', () => {
    render(<ReviewDecisionPanel decision={decision(chartRating)} kind="satellit" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Falsch' })).toBeNull();
  });

  it('shows push/fold verdicts with EV and the push/fold chart', () => {
    const spot = { kind: 'open', position: 'CO', stack: 12, hand: parseHand('AKo') } as const;
    const rating: DecisionRating = { model: 'pushfold', spot, chosen: 'shove', grade: grade(data, spot, 'shove'), effectiveBb: 12.3 };
    render(<ReviewDecisionPanel decision={decision(rating, { allIn: true })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Push/Fold-Daten · 12,3 BB effektiv')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AKo bei 12 BB – Range für diesen Spot' })).toBeTruthy();
  });

  it('explains why a decision is not rated and still shows the numbers', () => {
    const rating: DecisionRating = { model: 'unrated', reason: 'postflopPending' };
    render(<ReviewDecisionPanel decision={decision(rating, { street: 'turn', action: 'bet', amount: 450, to: null })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Nicht bewertet' })).toBeTruthy();
    expect(screen.getByText('Postflop-Bewertung folgt')).toBeTruthy();
    expect(screen.getByText('Deine Aktion: Bet 4,5 BB')).toBeTruthy();
    expect(screen.getByText('Turn · Pot 2,5 BB · zu callen 1 BB · Stack 39,9 BB')).toBeTruthy();
    expect(screen.getByText('nötige Equity 29 % · Einsatz 180 % vom Pot')).toBeTruthy();
  });

  const postflop = (over: Partial<PostflopRating> = {}): PostflopRating => ({
    model: 'postflop', verdict: 'mistake', reason: 'callTooWeak', equity: 0.12, needed: 0.286, bonus: 0, outs: 0, betShare: null, spr: 3.94,
    villainPosition: 'CO', villainRole: 'opener', depth: 40, approximation: true, combos: 87.4, ...over,
  });
  const riverCall = { street: 'river', action: 'call', amount: 100, to: null } as const;

  it('shows a postflop verdict with reason, equity, pot odds, SPR, the range and the rule-of-thumb note', () => {
    render(<ReviewDecisionPanel decision={decision(postflop(), riverCall)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Wahrscheinlich Fehler' })).toBeTruthy();
    expect(screen.getByText('Zu wenig Equity für den Call: Die Pot Odds verlangen deutlich mehr.')).toBeTruthy();
    expect(screen.getByText('Equity 12 % gegen die Range · nötig 29 %')).toBeTruthy();
    expect(screen.getByText('SPR 3,9')).toBeTruthy();
    expect(screen.getByText('Gegner CO: Open-Raise · Näherung: Chart für 40 BB · etwa 87 Kombinationen')).toBeTruthy();
    expect(screen.getByText('Faustregel, kein Solver-Ergebnis')).toBeTruthy();
  });

  it('names the implied-odds bonus, the bet size and "fraglich"', () => {
    const call = postflop({ verdict: 'questionable', reason: 'callThin', bonus: 5, outs: 9 });
    const { unmount } = render(<ReviewDecisionPanel decision={decision(call, { ...riverCall, street: 'flop' })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Fraglich' })).toBeTruthy();
    expect(screen.getByText('Equity 12 % gegen die Range · nötig 29 % (inkl. 5 Punkte Implied Odds (Draw mit mindestens 8 Outs))')).toBeTruthy();
    expect(screen.getByText('SPR 3,9 · 9 Outs')).toBeTruthy();
    unmount();
    const bet = postflop({ verdict: 'questionable', reason: 'betSize', betShare: 0.1 });
    render(<ReviewDecisionPanel decision={decision(bet, { street: 'turn', action: 'bet', toCall: 0, amount: 25, to: null })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByText('Ungewöhnliche Einsatzgröße: unter 20 % oder über 150 % vom Pot.')).toBeTruthy();
    expect(screen.getByText('Einsatz 10 % vom Pot · SPR 3,9')).toBeTruthy();
    expect(screen.queryByText(/nötig/)).toBeNull();
  });

  it('turns a postflop mistake into a hint in satellites and bounty tournaments', () => {
    render(<ReviewDecisionPanel decision={decision(postflop(), riverCall)} kind="bounty" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Wahrscheinlich Fehler' })).toBeNull();
  });

  it('explains an unrated postflop decision and still shows pot odds', () => {
    const rating: DecisionRating = { model: 'unrated', reason: 'multiwayPostflop' };
    render(<ReviewDecisionPanel decision={decision(rating, riverCall)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByText('Multiway')).toBeTruthy();
    expect(screen.getByText('nötige Equity 29 %')).toBeTruthy();
  });
});
