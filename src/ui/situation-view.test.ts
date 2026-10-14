import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { analyzeHand } from '../review/analysis';
import { parseHand } from '../review/parse';
import { parseCard } from '../engine/cards';
import { type LegalActions, type Situation, type SituationStep, addStep, bbToChips, playSituation } from '../situation/model';
import { TEST_PLAYED_AT, sameStacks } from '../situation/test-situations';
import { situationText } from '../situation/text';
import { defaultSituationName, lastEventText, parseBbInput, promptText, raiseWordAt, situationActionLabel, situationChoices, situationVerdictLabel, sizeOf, stepOf } from './situation-view';

const start: Situation = {
  setup: { handId: 'SIT1', kind: 'normal', hero: 'CO', heroCards: [parseCard('Ah'), parseCard('Kd')], stacks: sameStacks(25) },
  steps: [],
};
const legalOf = (s: Situation): LegalActions => {
  const { phase } = playSituation(s);
  if (phase.type !== 'act') throw new Error(phase.type);
  return phase.legal;
};
const play = (...steps: SituationStep[]) => steps.reduce(addStep, start);
const folds = (n: number): SituationStep[] => Array.from({ length: n }, () => ({ type: 'fold' }));

describe('situation view helpers', () => {
  it('reads BB with a comma or a point and at most one decimal', () => {
    expect(parseBbInput('2,5')).toBe(2.5);
    expect(parseBbInput(' 12.5 ')).toBe(12.5);
    expect(parseBbInput('7')).toBe(7);
    for (const text of ['', 'abc', '2,55', '-3', '1e3']) expect(parseBbInput(text)).toBeNull();
  });

  it('keeps a size between the minimum and the all-in and falls back to the suggested size', () => {
    const legal = legalOf(start);
    expect(sizeOf(legal, '3')).toBe(bbToChips(3));
    expect(sizeOf(legal, '1,5')).toBe(bbToChips(2));
    expect(sizeOf(legal, '500')).toBe(19900);
    expect(sizeOf(legal, '')).toBe(bbToChips(2.2));
    expect(sizeOf(legalOf(play({ type: 'raise', to: 999_999 })), '3')).toBeNull();
  });

  it('offers the possible actions with their sizes', () => {
    const legal = legalOf(start);
    expect(situationChoices(legal, sizeOf(legal, '')).map((c) => c.label)).toEqual([
      'Platz leer',
      'Fold',
      'Call 1 BB',
      'Raise auf 2,2 BB',
      'All-in 24,9 BB',
    ]);
    expect(situationChoices(legal, 19900).map((c) => c.label)).toEqual(['Platz leer', 'Fold', 'Call 1 BB', 'All-in 24,9 BB']);
    const shove = legalOf(play({ type: 'raise', to: 999_999 }));
    expect(situationChoices(shove, null).map((c) => c.label)).toEqual(['Fold', 'Call 24,9 BB · All-in']);
    const flop = addStep(play(...folds(4), { type: 'call' }, ...folds(2), { type: 'check' }), {
      type: 'board',
      cards: [parseCard('2c'), parseCard('7d'), parseCard('9h')],
    });
    const bb = legalOf(flop);
    expect(situationChoices(bb, sizeOf(bb, '')).map((c) => c.label)).toEqual(['Check', 'Bet 1,8 BB', 'All-in 23,9 BB']);
  });

  it('names raises like the training: Raise when opening, then 3-Bet and 4-Bet preflop, always Raise postflop', () => {
    const at = (s: Situation) => {
      const state = playSituation(s);
      return raiseWordAt(state.events, state.events.length);
    };
    expect(at(start)).toBe('Raise');
    const vsOpen = play({ type: 'raise', to: bbToChips(2.2) }, ...folds(3));
    expect(at(vsOpen)).toBe('3-Bet');
    const legal = legalOf(vsOpen);
    expect(situationChoices(legal, sizeOf(legal, ''), at(vsOpen)).map((c) => c.label)).toContain('3-Bet auf 6,6 BB');
    const vs3bet = addStep(vsOpen, { type: 'raise', to: bbToChips(6.6) });
    expect(at(play({ type: 'raise', to: bbToChips(2.2) }, ...folds(3), { type: 'raise', to: bbToChips(6.6) }, ...folds(3)))).toBe('4-Bet');
    expect(at(vs3bet)).toBe('4-Bet');
    const flop = addStep(play(...folds(4), { type: 'call' }, ...folds(2), { type: 'check' }), {
      type: 'board',
      cards: [parseCard('2c'), parseCard('7d'), parseCard('9h')],
    });
    expect(at(flop)).toBe('Raise');
  });

  it('labels the summary like the training: 3-Bet preflop, postflop verdict words', () => {
    const labels = { error: 'Fehler', hint: 'Hinweis', questionable: 'Fraglich', close: 'Knapp', correct: 'Richtig', unrated: 'Nicht bewertet' };
    const preflop: SituationStep[] = [{ type: 'raise', to: bbToChips(2.2) }, ...folds(3), { type: 'raise', to: bbToChips(6.6) }, ...folds(3), { type: 'call' }];
    const hand = play(...preflop, { type: 'board', cards: [parseCard('Qh'), parseCard('7c'), parseCard('2d')] }, { type: 'check' }, { type: 'bet', to: bbToChips(7) });
    const { events } = playSituation(hand);
    const [threeBet, bet] = analyzeHand(parseHand(situationText(hand, TEST_PLAYED_AT)), getPushFoldData()).decisions;
    expect(situationActionLabel(threeBet, events)).toBe('3-Bet auf 6,6 BB');
    expect(situationVerdictLabel(threeBet, 'normal', labels)).toBe('Richtig');
    expect(situationActionLabel(bet, events)).toBe('Bet 7 BB');
    expect(['Passt', 'Fraglich', 'Wahrscheinlich Fehler']).toContain(situationVerdictLabel(bet, 'normal', labels));
  });

  it('turns a button into the step of the model', () => {
    const legal = legalOf(start);
    expect(stepOf('fold', legal, null)).toEqual({ type: 'fold' });
    expect(stepOf('size', legal, 2400)).toEqual({ type: 'raise', to: 2400 });
    expect(stepOf('allIn', legal, 2400)).toEqual({ type: 'raise', to: 19900 });
    expect(stepOf('empty', legal, null)).toEqual({ type: 'empty' });
  });

  it('describes the table and what comes next', () => {
    expect(lastEventText(playSituation(start))).toBe('Karten verteilt');
    expect(promptText(playSituation(start))).toBe('UTG ist dran');
    const raised = play({ type: 'raise', to: bbToChips(2.2) }, ...folds(3));
    expect(lastEventText(playSituation(raised))).toBe('HJ: Fold');
    expect(promptText(playSituation(raised))).toBe('Du bist dran');
    const flop = play(...folds(4), { type: 'raise', to: bbToChips(2.2) }, ...folds(2), { type: 'call' });
    expect(promptText(playSituation(flop))).toBe('Flop: drei Karten wählen');
    expect(promptText(playSituation(addStep(flop, { type: 'board', cards: [0, 1, 2] })))).toBe('BB ist dran');
    const won = play(...folds(4), { type: 'raise', to: bbToChips(2.2) }, ...folds(3));
    expect(promptText(playSituation(won))).toBe('Alle anderen haben gefoldet – du gewinnst den Pot');
    expect(promptText(playSituation(play(...folds(5))))).toBe('Du hast gefoldet – die Hand ist für dich vorbei');
  });

  it('suggests a name like „AKo UTG · 25 BB“', () => {
    expect(defaultSituationName({ ...start.setup, hero: 'UTG' })).toBe('AKo UTG · 25 BB');
    expect(defaultSituationName({ ...start.setup, hero: 'UTG1', heroCards: [parseCard('9s'), parseCard('9h')], stacks: sameStacks(12.5) })).toBe(
      '99 UTG+1 · 12,5 BB',
    );
  });
});
