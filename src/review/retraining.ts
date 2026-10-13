import type { RetrainingCandidate } from '../game/retraining';
import { isRetrainingSpot } from '../storage/schema';
import type { HandAnalysis } from './analysis';
import { decisionOutcome } from './summary';
import type { TournamentKind } from './tournament-kind';

/** What the mapping needs of an archived hand (a `HandRecord` fits). */
export type RetrainingSource = { id: string; playedAt: string; analysis: HandAnalysis };

/**
 * Spec 10: the preflop errors of a tournament as trainable spots, oldest hand first. Only normal tournaments give
 * spots (in satellites and bounty tournaments a chart error is a hint, not an error); "knapp", unrated and postflop
 * decisions never count. A push/fold error becomes the same push/fold spot, a chart error the same starthand spot
 * (chart depth 40 or 100 BB, also when the stack was an approximation – the review counts it as an error, too).
 * Left out: a BB call against a shove at 1 BB (calling costs nothing, the training never deals it) and anything the
 * trainings could not deal.
 */
export function retrainingCandidates(kind: TournamentKind, hands: readonly RetrainingSource[]): RetrainingCandidate[] {
  if (kind !== 'normal') return [];
  const sorted = [...hands].sort((x, y) => x.playedAt.localeCompare(y.playedAt) || x.id.localeCompare(y.id));
  const out: RetrainingCandidate[] = [];
  for (const hand of sorted) {
    for (const d of hand.analysis.decisions) {
      if (d.street !== 'preflop' || decisionOutcome(d, kind) !== 'error') continue;
      const key = `${hand.id}:${d.eventIndex}`;
      const r = d.rating;
      let candidate: RetrainingCandidate | null = null;
      if (r.model === 'pushfold') {
        const freeCall = r.spot.kind === 'call' && r.spot.position === 'BB' && r.spot.stack === 1;
        if (!freeCall) candidate = { key, playedAt: hand.playedAt, game: 'pushfold', spot: r.spot };
      } else if (r.model === 'chart') {
        candidate = { key, playedAt: hand.playedAt, game: 'preflop', spot: r.spot };
      }
      if (candidate && isRetrainingSpot(candidate)) out.push(candidate);
    }
  }
  return out;
}
