import type { PreflopSpot } from '../engine/preflop/spots';
import type { Spot } from '../engine/pushfold';

/** Spec 10: about every fourth training spot comes from the queue (every fourth deal, if a queued spot fits). */
export const RETRAINING_EVERY = 4;
/** Two correct answers in a row take a spot out of the queue. */
export const RETRAINING_CLEAR_STREAK = 2;
/** At most this many queued spots; the oldest hands drop out first. */
export const MAX_RETRAINING_ENTRIES = 200;
/** Spots that left the queue are remembered, so a later sync of their tournament never brings them back. */
export const MAX_RETRAINING_DONE = 2000;
/** Tournaments fed into the queue; a forgotten id only means its hands are read once more. */
export const MAX_RETRAINING_SYNCED = 5000;

export type RetrainingSpot = { game: 'pushfold'; spot: Spot } | { game: 'preflop'; spot: PreflopSpot };
/**
 * A preflop error from the hand review that can be trained. `key` = `<hand id>:<event index of the decision>`,
 * `playedAt` as in the hand history ("2026-10-12 15:46:28").
 */
export type RetrainingCandidate = RetrainingSpot & { key: string; playedAt: string };
/** `streak` = correct answers in a row so far (0 or 1; the second one removes the entry). */
export type RetrainingEntry = RetrainingCandidate & { tournamentId: string; streak: number };
export type RetrainingState = {
  /** Only present (true) when the player switched the retraining off in the settings. */
  off?: true;
  /** Oldest hand first. */
  entries: RetrainingEntry[];
  /** Keys of spots that left the queue (two correct answers in a row, or dropped by the cap). */
  done: string[];
  /** Tournaments whose hands were fed into the queue at least once (backfill of archives from before Plan 9). */
  synced: string[];
};

/** A copy with a fixed key order, so equal spots always serialize the same way. */
export function copyRetrainingSpot(r: RetrainingSpot): RetrainingSpot {
  if (r.game === 'preflop') {
    const { kind, stack, hero, villain, hand } = r.spot;
    return { game: 'preflop', spot: { kind, stack, hero, villain, hand } };
  }
  const s = r.spot;
  return s.kind === 'open'
    ? { game: 'pushfold', spot: { kind: 'open', position: s.position, stack: s.stack, hand: s.hand } }
    : { game: 'pushfold', spot: { kind: 'call', shover: s.shover, position: s.position, stack: s.stack, hand: s.hand } };
}

export const byPlayedAt = (a: { playedAt: string; key: string }, b: { playedAt: string; key: string }): number =>
  a.playedAt.localeCompare(b.playedAt) || a.key.localeCompare(b.key);
