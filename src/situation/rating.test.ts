import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HeroDecision, analyzeHand } from '../review/analysis';
import bounty from '../review/fixtures/bounty.txt?raw';
import dailyClassic from '../review/fixtures/daily-classic.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { parseHand, parseHistory } from '../review/parse';
import { detectTournamentKind } from '../review/tournament-kind';
import { playSituation, upToLastHeroAction } from './model';
import { TEST_PLAYED_AT, situationFromHand } from './test-situations';
import { situationText } from './text';

const data = getPushFoldData();

/** What the player sees of a decision: the model, the spot and the verdict (equities are Monte-Carlo numbers). */
function verdictOf(d: HeroDecision) {
  const r = d.rating;
  const base = { street: d.street, action: d.action };
  if (r.model === 'unrated') return { ...base, model: r.model, reason: r.reason };
  if (r.model === 'postflop') return { ...base, model: r.model, verdict: r.verdict, reason: r.reason, villain: r.villainPosition, role: r.villainRole };
  return { ...base, model: r.model, spot: r.spot, verdict: r.grade.verdict };
}

describe('rating a situation', () => {
  const fixtures = [dailyClassic, bounty, steps].flatMap((text) => parseHistory(text).hands);

  it('gives a real hand entered again the same verdicts as the imported hand', () => {
    let compared = 0;
    let decisions = 0;
    const models = new Set<string>();
    for (const hand of fixtures) {
      const situation = situationFromHand(hand, detectTournamentKind(hand.tournamentName));
      if (!situation) continue;
      const imported = analyzeHand(hand, data).decisions.map(verdictOf);
      const entered = analyzeHand(parseHand(situationText(situation, TEST_PLAYED_AT)), data).decisions.map(verdictOf);
      expect(entered).toEqual(imported);
      compared++;
      decisions += imported.length;
      for (const d of imported) models.add(d.model);
    }
    // All 9 fixture hands (5 to 8 players), 19 hero decisions with every kind of rating.
    expect(compared).toBe(9);
    expect(decisions).toBe(19);
    expect([...models].sort()).toEqual(['chart', 'postflop', 'pushfold', 'unrated']);
  });

  it('rates every decision the same, live (hand cut after it) and in the whole hand', () => {
    let checked = 0;
    for (const hand of fixtures) {
      const situation = situationFromHand(hand);
      if (!situation) continue;
      const whole = analyzeHand(parseHand(situationText(situation, TEST_PLAYED_AT)), data).decisions;
      for (let n = 1; n <= situation.steps.length; n++) {
        const prefix = upToLastHeroAction({ setup: situation.setup, steps: situation.steps.slice(0, n) });
        if (!prefix) continue;
        const live = analyzeHand(parseHand(situationText(prefix, TEST_PLAYED_AT)), data).decisions;
        const last = live[live.length - 1];
        expect(last.eventIndex).toBe(playSituation(prefix).heroEvents.at(-1));
        expect(last).toEqual(whole.find((d) => d.eventIndex === last.eventIndex));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
