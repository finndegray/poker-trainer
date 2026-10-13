import { shiftDateKey } from '../game/streak';
import type { HandAnalysis, HeroDecision } from './analysis';
import type { TournamentKind } from './tournament-kind';

/**
 * What a decision counts as. `error` = preflop "falsch" in a normal tournament; in satellites and bounty
 * tournaments the same spot becomes a `hint` and is not counted (spec 5).
 */
export type DecisionOutcome = 'error' | 'hint' | 'close' | 'correct' | 'unrated';

export const SATELLITE_HINT = 'Satellit/Bounty – Standard-Chart nur bedingt gültig';

export function decisionOutcome(decision: HeroDecision, kind: TournamentKind): DecisionOutcome {
  const { rating } = decision;
  if (rating.model === 'unrated') return 'unrated';
  const verdict = rating.grade.verdict;
  if (verdict === 'wrong') return kind === 'normal' ? 'error' : 'hint';
  return verdict === 'close' ? 'close' : 'correct';
}

const SEVERITY: Record<DecisionOutcome, number> = { error: 4, hint: 3, close: 2, correct: 1, unrated: 0 };

/** Higher is worse; hands are sorted by it in the tournament view. */
export const handSeverity = (analysis: HandAnalysis, kind: TournamentKind): number =>
  Math.max(0, ...analysis.decisions.map((d) => SEVERITY[decisionOutcome(d, kind)]));

/** The worst outcome of a hand; null for a hand without hero decisions. */
export function handOutcome(analysis: HandAnalysis, kind: TournamentKind): DecisionOutcome | null {
  let worst: DecisionOutcome | null = null;
  for (const d of analysis.decisions) {
    const outcome = decisionOutcome(d, kind);
    if (worst === null || SEVERITY[outcome] > SEVERITY[worst]) worst = outcome;
  }
  return worst;
}

export type HandFilter = 'errors' | 'questionable' | 'all';

/** "auch fraglich" shows errors and satellite/bounty hints; Plan 8 adds the postflop "fraglich". */
export function matchesFilter(analysis: HandAnalysis, kind: TournamentKind, filter: HandFilter): boolean {
  if (filter === 'all') return true;
  const severity = handSeverity(analysis, kind);
  return filter === 'errors' ? severity >= SEVERITY.error : severity >= SEVERITY.hint;
}

export type DaySummary = { hands: number; preflopErrors: number };
export type TournamentSummary = {
  hands: number;
  preflopErrors: number;
  /** Always 0 until Plan 8 rates postflop decisions. */
  postflopErrors: number;
  hints: number;
  /** Per date key, for the weekly "Fehler pro 100 Hände" trend. */
  days: Record<string, DaySummary>;
};

export function summarize(entries: readonly { dateKey: string; analysis: HandAnalysis }[], kind: TournamentKind): TournamentSummary {
  const summary: TournamentSummary = { hands: 0, preflopErrors: 0, postflopErrors: 0, hints: 0, days: {} };
  for (const { dateKey, analysis } of entries) {
    const day = (summary.days[dateKey] ??= { hands: 0, preflopErrors: 0 });
    summary.hands++;
    day.hands++;
    for (const d of analysis.decisions) {
      const outcome = decisionOutcome(d, kind);
      if (outcome === 'hint') summary.hints++;
      if (outcome !== 'error') continue;
      if (d.street === 'preflop') {
        summary.preflopErrors++;
        day.preflopErrors++;
      } else summary.postflopErrors++;
    }
  }
  return summary;
}

export const errorsPer100 = (errors: number, hands: number): number | null => (hands === 0 ? null : (errors / hands) * 100);

export type ErrorWeek = { weekStart: string; weekEnd: string; hands: number; errors: number; per100: number | null };

/** "Fehler pro 100 Hände" for the last `weeks` weeks up to today, from the per-day summaries of all tournaments. */
export function weeklyErrorTrend(summaries: readonly TournamentSummary[], todayKey: string, weeks = 8): ErrorWeek[] {
  const out: ErrorWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = shiftDateKey(todayKey, -7 * i);
    const weekStart = shiftDateKey(weekEnd, -6);
    let hands = 0;
    let errors = 0;
    for (const s of summaries) {
      for (const [key, day] of Object.entries(s.days)) {
        if (key < weekStart || key > weekEnd) continue;
        hands += day.hands;
        errors += day.preflopErrors;
      }
    }
    out.push({ weekStart, weekEnd, hands, errors, per100: errorsPer100(errors, hands) });
  }
  return out;
}
