import { type Card, dealConcrete } from '../engine/cards';
import { type PositionComparison, comparePositions } from '../engine/position-compare';
import { type Action, type ChartCell, type Spot, chart } from '../engine/pushfold';
import { chartFor } from '../engine/preflop/charts';
import { type PreflopCell, type PreflopComparison, comparePreflopPositions, preflopCells } from '../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../engine/preflop/spots';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { type DailyResult, dailySpots } from '../game/daily';
import { nextRunSpot } from '../game/endphase-run';
import { type PreflopFilter, isPreflopFilter, matchesPreflopFilter, preflopFilterOf, samePreflopFilter } from '../game/preflop-filter';
import {
  type RetrainingCandidate,
  answerRetraining,
  forgetRetraining,
  isRetrainingTurn,
  pickRetraining,
  retrainingOf,
  setRetrainingOn,
  syncRetraining,
} from '../game/retraining';
import {
  type DecisionOutcome,
  type PreflopDecisionOutcome,
  type SessionStatus,
  answerActiveRun,
  nextPreflopTrainingSpot,
  nextTrainingSpot,
  recordDaily,
  recordDecision,
  recordPreflopDecision,
  recordRun,
  setSound,
  startActiveRun,
  statusOf,
} from '../game/session';
import type { DecisionMode } from '../game/stats';
import { localDateKey } from '../game/streak';
import type { RankName } from '../game/xp';
import { type RunSummary, type SaveState, deserialize, serialize } from '../storage/schema';
import type { BackupApi, Persistence, PersistenceInfo } from './persistence';

/** A spot from the retraining queue (spec 10): its key and when the hand was played, for „Aus deinem Turnier vom 12.10.“. */
export type RetrainingOrigin = { key: string; playedAt: string };
export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number; retraining?: RetrainingOrigin };
export type PreflopDeal = { spot: PreflopSpot; cards: readonly [Card, Card]; shownAt: number; retraining?: RetrainingOrigin };
export type PreflopAnswerResult = {
  outcome: PreflopDecisionOutcome;
  comparison: PreflopComparison;
  cells: PreflopCell[];
  /** The chart's German learning sentence. */
  note: string;
};

export function preflopAnswerResult(outcome: PreflopDecisionOutcome): PreflopAnswerResult {
  const spot = outcome.record.spot;
  const chart = chartFor(spot);
  return { outcome, comparison: comparePreflopPositions(spot), cells: preflopCells(chart), note: chart.note };
}

export type AnswerResult = { outcome: DecisionOutcome; comparison: PositionComparison; chart: ChartCell[] };
export type Notice = 'writer-acquired' | 'update-available';
export type DailyOutcome = { result: DailyResult; accepted: boolean; isPersonalBest: boolean };
export type RunOutcome = { summary: RunSummary; isPersonalBest: boolean };
export type Session =
  | { kind: 'training' }
  | {
      kind: 'daily';
      dateKey: string;
      spots: Spot[];
      index: number;
      correct: number;
      startedAt: number;
      outcome: DailyOutcome | null;
    }
  | { kind: 'run'; outcome: RunOutcome | null };
export type GameSnapshot = {
  save: SaveState;
  status: SessionStatus;
  info: PersistenceInfo;
  current: TrainingSpot | null;
  last: AnswerResult | null;
  saveError: string | null;
  notice: Notice | null;
  session: Session;
  celebration: RankName | null;
  /** The starthand training runs beside the push/fold session and never changes it. */
  preflopCurrent: PreflopDeal | null;
  preflopLast: PreflopAnswerResult | null;
};
export type GameStoreDeps = {
  data: PushFoldData;
  persistence: Pick<Persistence, 'initial' | 'info' | 'save' | 'backups'>;
  rng: Rng;
  now: () => Date;
  clock: () => number;
};
export type GameStore = {
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  nextTrainingSpot(): void;
  /** Re-entering training: keeps an unanswered spot (restarting its timer), otherwise deals a new one. */
  resumeTraining(): void;
  answer(action: Action): AnswerResult;
  setSound(on: boolean): void;
  reportSaveError(error: unknown): void;
  refreshStatus(): void;
  /** Takes over the state another tab left behind, once this tab became the writer. */
  adoptSavedState(fresh: SaveState): void;
  setUpdateAvailable(): void;
  dismissNotice(): void;
  startTraining(): void;
  startDaily(options?: { restart?: boolean }): void;
  startRun(options?: { restart?: boolean }): void;
  /** Next spot in the current mode; finishes the daily after its last spot. */
  next(): void;
  dismissCelebration(): void;
  exportState(): string;
  /** Validates, backs up the current state, then replaces it. */
  importState(text: string): Promise<void>;
  getBackups(): BackupApi;
  /** Time while the app is hidden does not count for the current spot or the daily duration. */
  onVisibilityChange(visible: boolean): void;
  /** Enters the starthand training: keeps an unanswered spot (restarting its timer), otherwise deals a new one. */
  startPreflop(): void;
  /** Deals the next starthand spot from the filter in the profile. */
  nextPreflopSpot(): void;
  answerPreflop(action: PreflopAction): PreflopAnswerResult;
  /** Remembers the filter in the profile; an unanswered spot is replaced by one that fits. */
  setPreflopFilter(filter: PreflopFilter): void;
  /** Replaces the queued spots of one tournament with its current preflop errors (spec 10); ignored in read-only mode. */
  syncRetraining(tournamentId: string, candidates: readonly RetrainingCandidate[], markSynced?: boolean): void;
  /** Removes the queued spots of a deleted tournament. */
  forgetRetraining(tournamentId: string): void;
  /** Tournaments whose hands were fed into the queue already. */
  retrainingSynced(): ReadonlySet<string>;
  /** The settings switch „Nachtraining mit Fehlern aus deinen Turnieren“. */
  setRetrainingOn(on: boolean): void;
};

export function createGameStore(deps: GameStoreDeps): GameStore {
  const { data, persistence, rng, now, clock } = deps;
  let snapshot: GameSnapshot = {
    save: persistence.initial,
    status: statusOf(persistence.initial, now()),
    info: persistence.info,
    current: null,
    last: null,
    saveError: null,
    notice: null,
    session: { kind: 'training' },
    celebration: null,
    preflopCurrent: null,
    preflopLast: null,
  };
  // Remembered separately, so the update notice comes back after the writer notice is dismissed.
  let updateAvailable = false;
  let hiddenSince: number | null = null;
  // Spec 10: every fourth deal of a training may come from the queue. Counted per training and only in memory.
  let pushfoldDeals = 0;
  let preflopDeals = 0;
  let lastPushfoldKey: string | null = null;
  let lastPreflopKey: string | null = null;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<GameSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const commit = (save: SaveState, patch: Partial<GameSnapshot> = {}) => {
    persistence.save(save);
    update({ ...patch, save, status: statusOf(save, now()) });
  };
  const assertPlayable = () => {
    if (snapshot.info.readOnly) throw new Error('Im Nur-Lesen-Modus nicht möglich');
  };
  const deal = (spot: Spot): TrainingSpot => ({ spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() });
  /** Keeps an unanswered spot but restarts its timer, so time spent elsewhere does not count. */
  const restartTimer = () => {
    if (snapshot.current && !snapshot.last) update({ current: { ...snapshot.current, shownAt: clock() } });
  };

  const store: GameStore = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    nextTrainingSpot() {
      if (snapshot.info.readOnly) throw new Error('Training ist im Nur-Lesen-Modus nicht möglich');
      pushfoldDeals += 1;
      // The push/fold training has no filter, so every queued push/fold spot fits.
      const queued = isRetrainingTurn(pushfoldDeals) ? pickRetraining(snapshot.save, (e) => e.game === 'pushfold', lastPushfoldKey) : null;
      if (queued?.game === 'pushfold') {
        lastPushfoldKey = queued.key;
        const spot: Spot = { ...queued.spot };
        update({
          current: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock(), retraining: { key: queued.key, playedAt: queued.playedAt } },
          last: null,
        });
        return;
      }
      const spot = nextTrainingSpot(data, snapshot.save, rng);
      update({ current: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() }, last: null });
    },
    resumeTraining() {
      const current = snapshot.current;
      if (!current || snapshot.last) store.nextTrainingSpot();
      else update({ current: { ...current, shownAt: clock() } });
    },
    answer(action) {
      const current = snapshot.current;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.last) throw new Error('Dieser Spot ist bereits beantwortet');
      const mode: DecisionMode = snapshot.session.kind;
      const outcome = recordDecision(data, snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        mode,
        now: now(),
      });
      let save = outcome.state;
      let session = snapshot.session;
      // A queued spot counts like any other training spot and also moves its queue entry on.
      if (current.retraining && session.kind === 'training') save = answerRetraining(save, current.retraining.key, outcome.grade.verdict);
      let celebration = outcome.rank.rankUp ? outcome.rank.after : snapshot.celebration;
      if (session.kind === 'daily') {
        const correct = session.correct + (outcome.grade.verdict === 'wrong' ? 0 : 1);
        const elapsedMs = Math.max(0, Math.round(clock() - session.startedAt));
        session = { ...session, correct };
        if (session.index === session.spots.length - 1) {
          const result: DailyResult = { dateKey: session.dateKey, correct, total: session.spots.length, durationMs: elapsedMs };
          const recorded = recordDaily(save, result);
          save = { ...recorded.state, dailyProgress: null };
          session = { ...session, outcome: { result, accepted: recorded.accepted, isPersonalBest: recorded.isPersonalBest } };
        } else {
          save = { ...save, dailyProgress: { dateKey: session.dateKey, index: session.index + 1, correct, elapsedMs } };
        }
      } else if (session.kind === 'run') {
        save = answerActiveRun(save, outcome.grade.verdict);
        const run = save.activeRun;
        if (run && run.status !== 'running') {
          const finished = recordRun(save, run, now());
          save = finished.state;
          session = { kind: 'run', outcome: { summary: finished.summary, isPersonalBest: finished.isPersonalBest } };
          if (finished.rank.rankUp) celebration = finished.rank.after;
        }
      }
      const result: AnswerResult = {
        outcome,
        comparison: comparePositions(data, current.spot),
        chart: chart(data, current.spot),
      };
      commit(save, { last: result, session, celebration });
      return result;
    },
    setSound(on) {
      commit(setSound(snapshot.save, on));
    },
    reportSaveError(error) {
      update({ saveError: error instanceof Error ? error.message : String(error) });
    },
    refreshStatus() {
      update({ status: statusOf(snapshot.save, now()) });
    },
    adoptSavedState(fresh) {
      update({
        save: fresh,
        status: statusOf(fresh, now()),
        info: { ...snapshot.info, otherTabActive: false },
        current: null,
        last: null,
        session: { kind: 'training' },
        celebration: null,
        notice: 'writer-acquired',
        preflopCurrent: null,
        preflopLast: null,
      });
    },
    setUpdateAvailable() {
      updateAvailable = true;
      if (snapshot.notice === null) update({ notice: 'update-available' });
    },
    dismissNotice() {
      update({ notice: snapshot.notice === 'writer-acquired' && updateAvailable ? 'update-available' : null });
    },
    startTraining() {
      assertPlayable();
      if (snapshot.session.kind !== 'training') update({ session: { kind: 'training' }, current: null, last: null });
      store.resumeTraining();
    },
    startDaily(options = {}) {
      assertPlayable();
      const dateKey = localDateKey(now());
      const s = snapshot.session;
      if (!options.restart && s.kind === 'daily' && s.dateKey === dateKey) {
        if (!s.outcome) restartTimer();
        return;
      }
      const spots = dailySpots(data, dateKey);
      const saved = snapshot.save.dailyProgress;
      if (!options.restart && saved !== null && saved.dateKey === dateKey) {
        // Resume the daily that a reload or a mode switch interrupted.
        update({
          session: { kind: 'daily', dateKey, spots, index: saved.index, correct: saved.correct, startedAt: clock() - saved.elapsedMs, outcome: null },
          current: deal(spots[saved.index]),
          last: null,
        });
        return;
      }
      const session: Session = { kind: 'daily', dateKey, spots, index: 0, correct: 0, startedAt: clock(), outcome: null };
      const patch: Partial<GameSnapshot> = { session, current: deal(spots[0]), last: null };
      // A restart or a new day drops the stored progress.
      if (saved !== null) commit({ ...snapshot.save, dailyProgress: null }, patch);
      else update(patch);
    },
    startRun(options = {}) {
      assertPlayable();
      const s = snapshot.session;
      if (!options.restart && s.kind === 'run') {
        if (s.outcome) return;
        if (snapshot.current) {
          restartTimer();
          return;
        }
      }
      let save = snapshot.save;
      if (options.restart || save.activeRun === null || save.activeRun.status !== 'running') {
        save = startActiveRun(save);
        persistence.save(save);
      }
      update({
        save,
        status: statusOf(save, now()),
        session: { kind: 'run', outcome: null },
        current: deal(nextRunSpot(data, save.activeRun!, rng)),
        last: null,
      });
    },
    next() {
      const s = snapshot.session;
      if (s.kind === 'training') {
        store.nextTrainingSpot();
        return;
      }
      if (s.kind === 'daily') {
        if (snapshot.current && !snapshot.last) return;
        if (s.outcome) {
          update({ current: null, last: null });
          return;
        }
        const index = s.index + 1;
        update({ session: { ...s, index }, current: deal(s.spots[index]), last: null });
        return;
      }
      if (snapshot.current && !snapshot.last) return;
      if (s.outcome) {
        update({ current: null, last: null });
        return;
      }
      const run = snapshot.save.activeRun;
      if (!run) throw new Error('Kein laufender Run vorhanden');
      update({ current: deal(nextRunSpot(data, run, rng)), last: null });
    },
    dismissCelebration() {
      update({ celebration: null });
    },
    exportState() {
      return serialize(snapshot.save);
    },
    async importState(text) {
      const imported = deserialize(text);
      await persistence.backups.create(serialize(snapshot.save));
      commit(imported, {
        session: { kind: 'training' },
        current: null,
        last: null,
        celebration: null,
        preflopCurrent: null,
        preflopLast: null,
      });
    },
    getBackups() {
      return persistence.backups;
    },
    onVisibilityChange(visible) {
      if (!visible) {
        hiddenSince ??= clock();
        return;
      }
      if (hiddenSince === null) return;
      const hidden = clock() - hiddenSince;
      hiddenSince = null;
      const patch: Partial<GameSnapshot> = {};
      if (snapshot.current && !snapshot.last) patch.current = { ...snapshot.current, shownAt: snapshot.current.shownAt + hidden };
      if (snapshot.preflopCurrent && !snapshot.preflopLast) {
        patch.preflopCurrent = { ...snapshot.preflopCurrent, shownAt: snapshot.preflopCurrent.shownAt + hidden };
      }
      const s = snapshot.session;
      if (s.kind === 'daily' && !s.outcome) patch.session = { ...s, startedAt: s.startedAt + hidden };
      if (patch.current || patch.session || patch.preflopCurrent) update(patch);
    },
    startPreflop() {
      assertPlayable();
      const current = snapshot.preflopCurrent;
      if (!current || snapshot.preflopLast) store.nextPreflopSpot();
      else update({ preflopCurrent: { ...current, shownAt: clock() } });
    },
    nextPreflopSpot() {
      assertPlayable();
      preflopDeals += 1;
      const filter = preflopFilterOf(snapshot.save.profile);
      const queued = isRetrainingTurn(preflopDeals)
        ? pickRetraining(snapshot.save, (e) => e.game === 'preflop' && matchesPreflopFilter(e.spot, filter), lastPreflopKey)
        : null;
      if (queued?.game === 'preflop') {
        lastPreflopKey = queued.key;
        const spot: PreflopSpot = { ...queued.spot };
        update({
          preflopCurrent: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock(), retraining: { key: queued.key, playedAt: queued.playedAt } },
          preflopLast: null,
        });
        return;
      }
      const spot = nextPreflopTrainingSpot(snapshot.save, rng);
      update({ preflopCurrent: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() }, preflopLast: null });
    },
    answerPreflop(action) {
      const current = snapshot.preflopCurrent;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.preflopLast) throw new Error('Dieser Spot ist bereits beantwortet');
      const outcome = recordPreflopDecision(snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        now: now(),
      });
      const result = preflopAnswerResult(outcome);
      const save = current.retraining ? answerRetraining(outcome.state, current.retraining.key, outcome.grade.verdict) : outcome.state;
      commit(save, {
        preflopLast: result,
        celebration: outcome.rank.rankUp ? outcome.rank.after : snapshot.celebration,
      });
      return result;
    },
    setPreflopFilter(filter) {
      assertPlayable();
      if (!isPreflopFilter(filter)) throw new Error('Ungültiger Starthand-Filter');
      if (samePreflopFilter(filter, preflopFilterOf(snapshot.save.profile))) return;
      const preflopFilter: PreflopFilter = { kind: filter.kind, stack: filter.stack };
      commit({ ...snapshot.save, profile: { ...snapshot.save.profile, preflopFilter } });
      // An unanswered spot may not fit the new filter; an answered one keeps its feedback.
      if (snapshot.preflopCurrent && !snapshot.preflopLast) store.nextPreflopSpot();
    },
    syncRetraining(tournamentId, candidates, markSynced) {
      if (snapshot.info.readOnly) return;
      const next = syncRetraining(snapshot.save, tournamentId, candidates, markSynced);
      if (next !== snapshot.save) commit(next);
    },
    forgetRetraining(tournamentId) {
      if (snapshot.info.readOnly) return;
      const next = forgetRetraining(snapshot.save, tournamentId);
      if (next !== snapshot.save) commit(next);
    },
    retrainingSynced() {
      return new Set(retrainingOf(snapshot.save).synced);
    },
    setRetrainingOn(on) {
      assertPlayable();
      const next = setRetrainingOn(snapshot.save, on);
      if (next !== snapshot.save) commit(next);
    },
  };
  return store;
}
