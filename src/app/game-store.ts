import { type Card, dealConcrete } from '../engine/cards';
import { type PositionComparison, comparePositions } from '../engine/position-compare';
import { type Action, type ChartCell, type Spot, chart } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { type DailyResult, dailySpots } from '../game/daily';
import { nextRunSpot } from '../game/endphase-run';
import {
  type DecisionOutcome,
  type SessionStatus,
  answerActiveRun,
  nextTrainingSpot,
  recordDaily,
  recordDecision,
  recordRun,
  setSound,
  startActiveRun,
  statusOf,
} from '../game/session';
import type { DecisionMode } from '../game/stats';
import { localDateKey } from '../game/streak';
import type { RankName } from '../game/xp';
import { type RunSummary, type SaveState, deserialize, serialize } from '../storage/schema';
import type { Persistence, PersistenceInfo } from './persistence';

export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number };
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
  };
  // Remembered separately, so the update notice comes back after the writer notice is dismissed.
  let updateAvailable = false;
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
      let celebration = outcome.rank.rankUp ? outcome.rank.after : snapshot.celebration;
      if (session.kind === 'daily') {
        session = { ...session, correct: session.correct + (outcome.grade.verdict === 'wrong' ? 0 : 1) };
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
        notice: 'writer-acquired',
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
      update({
        session: { kind: 'daily', dateKey, spots, index: 0, correct: 0, startedAt: clock(), outcome: null },
        current: deal(spots[0]),
        last: null,
      });
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
        if (s.outcome) return;
        const index = s.index + 1;
        if (index < s.spots.length) {
          update({ session: { ...s, index }, current: deal(s.spots[index]), last: null });
          return;
        }
        const result: DailyResult = {
          dateKey: s.dateKey,
          correct: s.correct,
          total: s.spots.length,
          durationMs: Math.max(0, Math.round(clock() - s.startedAt)),
        };
        const recorded = recordDaily(snapshot.save, result);
        commit(recorded.state, {
          session: { ...s, outcome: { result, accepted: recorded.accepted, isPersonalBest: recorded.isPersonalBest } },
          current: null,
          last: null,
        });
        return;
      }
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
      commit(imported, { session: { kind: 'training' }, current: null, last: null });
    },
  };
  return store;
}
