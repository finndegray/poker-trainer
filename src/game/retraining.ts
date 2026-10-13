import type { PreflopSpot } from '../engine/preflop/spots';
import type { Spot, Verdict } from '../engine/pushfold';
import type { SaveState } from '../storage/schema';

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

/** Plain code-unit order, so the queue order is the same on every device. */
const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

export const byPlayedAt = (a: { playedAt: string; key: string }, b: { playedAt: string; key: string }): number =>
  cmp(a.playedAt, b.playedAt) || cmp(a.key, b.key);

const EMPTY: RetrainingState = Object.freeze({
  entries: Object.freeze([]) as unknown as RetrainingEntry[],
  done: Object.freeze([]) as unknown as string[],
  synced: Object.freeze([]) as unknown as string[],
});

const spotId = (r: RetrainingSpot): string => JSON.stringify(copyRetrainingSpot(r));

export const retrainingOf = (state: SaveState): RetrainingState => state.retraining ?? EMPTY;
export const retrainingOn = (state: SaveState): boolean => state.retraining?.off !== true;
export const retrainingCount = (state: SaveState): number => retrainingOf(state).entries.length;

const sameList = <T>(x: readonly T[], y: readonly T[], eq: (p: T, q: T) => boolean): boolean =>
  x.length === y.length && x.every((v, i) => eq(v, y[i]));

const sameEntry = (x: RetrainingEntry, y: RetrainingEntry): boolean =>
  x.key === y.key && x.tournamentId === y.tournamentId && x.playedAt === y.playedAt && x.streak === y.streak && spotId(x) === spotId(y);

const sameRetraining = (x: RetrainingState, y: RetrainingState): boolean =>
  (x.off === true) === (y.off === true) &&
  sameList(x.entries, y.entries, sameEntry) &&
  sameList(x.done, y.done, (p, q) => p === q) &&
  sameList(x.synced, y.synced, (p, q) => p === q);

/** Sorts by hand time and applies the cap; dropped keys count as done. */
function withEntries(state: SaveState, base: RetrainingState, entries: RetrainingEntry[], synced: string[]): SaveState {
  const sorted = [...entries].sort(byPlayedAt);
  const overflow = Math.max(0, sorted.length - MAX_RETRAINING_ENTRIES);
  const done = [...base.done, ...sorted.slice(0, overflow).map((e) => e.key)].slice(-MAX_RETRAINING_DONE);
  return {
    ...state,
    retraining: { ...(base.off ? { off: true } : {}), entries: sorted.slice(overflow), done, synced: synced.slice(-MAX_RETRAINING_SYNCED) },
  };
}

/**
 * Replaces the queued spots of one tournament with `candidates` (all its current preflop errors; empty for satellites
 * and bounty tournaments). A spot that stays keeps its streak; spots in `done` never come back. Without any queue and
 * without candidates the save stays exactly as it is, unless `markSynced` is set (the one-time read of an archive:
 * a tournament whose errors all map to nothing is still marked as read).
 */
export function syncRetraining(
  state: SaveState,
  tournamentId: string,
  candidates: readonly RetrainingCandidate[],
  markSynced = false,
): SaveState {
  if (state.retraining === undefined && candidates.length === 0 && !markSynced) return state;
  const base = retrainingOf(state);
  const done = new Set(base.done);
  const others = base.entries.filter((e) => e.tournamentId !== tournamentId);
  const previous = new Map(base.entries.filter((e) => e.tournamentId === tournamentId).map((e) => [e.key, e]));
  const seen = new Set(others.map((e) => e.key));
  const fresh: RetrainingEntry[] = [];
  for (const c of candidates) {
    if (done.has(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    const old = previous.get(c.key);
    const streak = old && spotId(old) === spotId(c) ? old.streak : 0;
    fresh.push({ key: c.key, tournamentId, playedAt: c.playedAt, streak, ...copyRetrainingSpot(c) });
  }
  const synced = base.synced.includes(tournamentId) ? base.synced : [...base.synced, tournamentId];
  const next = withEntries(state, base, [...others, ...fresh], synced);
  return state.retraining !== undefined && next.retraining && sameRetraining(state.retraining, next.retraining) ? state : next;
}

/** A deleted tournament takes its queued spots with it; done keys stay, so a re-import does not bring cleared spots back. */
export function forgetRetraining(state: SaveState, tournamentId: string): SaveState {
  const r = state.retraining;
  if (!r || (!r.synced.includes(tournamentId) && !r.entries.some((e) => e.tournamentId === tournamentId))) return state;
  return {
    ...state,
    retraining: { ...r, entries: r.entries.filter((e) => e.tournamentId !== tournamentId), synced: r.synced.filter((id) => id !== tournamentId) },
  };
}

export function setRetrainingOn(state: SaveState, on: boolean): SaveState {
  if (on === retrainingOn(state)) return state;
  const { off: _, ...rest } = retrainingOf(state);
  return { ...state, retraining: on ? rest : { off: true, ...rest } };
}

/** After a queued spot was answered: a wrong answer resets the streak, the second correct one in a row removes it. */
export function answerRetraining(state: SaveState, key: string, verdict: Verdict): SaveState {
  const r = state.retraining;
  const entry = r?.entries.find((e) => e.key === key);
  if (!r || !entry) return state;
  const streak = verdict === 'wrong' ? 0 : entry.streak + 1;
  if (streak >= RETRAINING_CLEAR_STREAK) {
    return { ...state, retraining: { ...r, entries: r.entries.filter((e) => e.key !== key), done: [...r.done, key].slice(-MAX_RETRAINING_DONE) } };
  }
  return { ...state, retraining: { ...r, entries: r.entries.map((e) => (e.key === key ? { ...e, streak } : e)) } };
}

/** Is the `deal`-th spot of a training (counted from 1) a queue turn? */
export const isRetrainingTurn = (deal: number): boolean => deal > 0 && deal % RETRAINING_EVERY === 0;

/**
 * The next queued spot that fits, round robin in queue order after `afterKey` (the spot drawn last time), so every
 * fitting spot comes up in turn. Null when the retraining is off or nothing fits.
 */
export function pickRetraining(state: SaveState, fits: (entry: RetrainingEntry) => boolean, afterKey: string | null): RetrainingEntry | null {
  if (!retrainingOn(state)) return null;
  const list = retrainingOf(state).entries;
  const start = afterKey === null ? 0 : list.findIndex((e) => e.key === afterKey) + 1;
  for (let i = 0; i < list.length; i++) {
    const entry = list[(start + i) % list.length];
    if (fits(entry)) return entry;
  }
  return null;
}
